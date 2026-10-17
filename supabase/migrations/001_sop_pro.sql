-- SOP-PRO initial schema
create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','editor','viewer','device')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.current_sop_role()
returns text language sql stable security definer set search_path = public
as $$ select coalesce((select role from public.user_roles where user_id = auth.uid()), 'viewer'); $$;

create or replace function public.can_manage_sops()
returns boolean language sql stable security definer set search_path = public
as $$ select public.current_sop_role() in ('admin','editor'); $$;

create table if not exists public.production_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  model_number text not null unique,
  product_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  stage_number integer not null check (stage_number > 0),
  stage_name text not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique(product_id, stage_number)
);
create table if not exists public.sop_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text not null,
  file_url text,
  revision text not null,
  status text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  product_id uuid references public.products(id) on delete set null,
  stage_id uuid references public.production_stages(id) on delete set null,
  checksum_sha256 text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);
create table if not exists public.sop_displays (
  id uuid primary key default gen_random_uuid(),
  display_code text not null unique,
  line_id uuid not null references public.production_lines(id) on delete restrict,
  stage_id uuid references public.production_stages(id) on delete set null,
  device_status text not null default 'unknown' check (device_status in ('online','offline','unknown')),
  last_seen_at timestamptz,
  last_acknowledged_plan_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.production_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  line_id uuid not null references public.production_lines(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','published','superseded','blocked')),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(plan_date, line_id, product_id, version)
);
create unique index if not exists production_plans_one_published_per_line_date
  on public.production_plans(plan_date,line_id) where status = 'published';
create table if not exists public.plan_stage_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.production_plans(id) on delete cascade,
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  display_id uuid not null references public.sop_displays(id) on delete restrict,
  sop_document_id uuid not null references public.sop_documents(id) on delete restrict,
  assignment_source text not null default 'central' check (assignment_source in ('central','manual_override')),
  override_reason text,
  created_at timestamptz not null default now(),
  unique(plan_id, stage_id),
  unique(plan_id, display_id),
  check (assignment_source <> 'manual_override' or nullif(trim(override_reason),'') is not null)
);
create table if not exists public.distribution_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.production_plans(id) on delete cascade,
  display_id uuid not null references public.sop_displays(id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending','Downloading','Verified','Applied','Acknowledged','Failed')),
  detail text,
  checksum_sha256 text,
  event_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sop_displays drop constraint if exists sop_displays_last_acknowledged_plan_id_fkey;
alter table public.sop_displays add constraint sop_displays_last_acknowledged_plan_id_fkey
  foreign key (last_acknowledged_plan_id) references public.production_plans(id) on delete set null;

create or replace function public.publish_sop_plan(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare p public.production_plans%rowtype;
declare expected_count integer;
declare assigned_count integer;
declare invalid_count integer;
declare next_version integer;
begin
  if not public.can_manage_sops() then raise exception 'Permission denied: SOP manager role required'; end if;
  select * into p from public.production_plans where id = p_plan_id for update;
  if not found then raise exception 'Plan not found'; end if;
  if p.status not in ('draft','blocked') then raise exception 'Only draft or blocked plans can be published'; end if;

  select count(*) into expected_count
  from public.production_stages s where s.product_id = p.product_id and s.required = true;

  select count(*) into assigned_count
  from public.plan_stage_assignments a
  join public.production_stages s on s.id = a.stage_id
  where a.plan_id = p.id and s.product_id = p.product_id and s.required = true;

  if assigned_count <> expected_count then
    raise exception 'Publish blocked: every required product stage must have an assignment (% of % assigned)', assigned_count, expected_count;
  end if;

  select count(*) into invalid_count
  from public.plan_stage_assignments a
  join public.production_stages s on s.id = a.stage_id
  join public.sop_documents d on d.id = a.sop_document_id
  join public.sop_displays dev on dev.id = a.display_id
  where a.plan_id = p.id and (
    s.product_id <> p.product_id or dev.line_id <> p.line_id or
    d.status <> 'approved' or d.stage_id is distinct from s.id or
    (a.assignment_source = 'manual_override' and nullif(trim(a.override_reason),'') is null)
  );
  if invalid_count > 0 then raise exception 'Publish blocked: invalid product, line, display, revision approval, or override justification'; end if;

  if exists (
    select 1 from public.plan_stage_assignments a
    join public.sop_displays dev on dev.id = a.display_id
    where a.plan_id = p.id and dev.stage_id is not null and dev.stage_id <> a.stage_id
  ) then raise exception 'Publish blocked: display is paired to a different stage'; end if;

  update public.production_plans set status = 'superseded'
  where plan_date = p.plan_date and line_id = p.line_id and status = 'published' and id <> p.id;

  select coalesce(max(version),0)+1 into next_version
  from public.production_plans where plan_date = p.plan_date and line_id = p.line_id and id <> p.id;

  update public.production_plans set status = 'published', published_at = now(),
    published_by = auth.uid(), version = greatest(version, next_version)
  where id = p.id;

  insert into public.distribution_events(plan_id, display_id, status, detail)
  select p.id, a.display_id, 'Pending', 'Publish created; device receipt not yet confirmed'
  from public.plan_stage_assignments a where a.plan_id = p.id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values(auth.uid(), 'publish', 'production_plan', p.id, jsonb_build_object('version', greatest(p.version,next_version), 'plan_date',p.plan_date,'line_id',p.line_id,'product_id',p.product_id));

  return jsonb_build_object('ok',true,'plan_id',p.id,'version',greatest(p.version,next_version),'message','Plan published; device delivery remains pending until each display acknowledges.');
end;
$$;

alter table public.user_roles enable row level security;
alter table public.production_lines enable row level security;
alter table public.products enable row level security;
alter table public.production_stages enable row level security;
alter table public.sop_documents enable row level security;
alter table public.sop_displays enable row level security;
alter table public.production_plans enable row level security;
alter table public.plan_stage_assignments enable row level security;
alter table public.distribution_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "role rows readable by self or admin" on public.user_roles;
create policy "role rows readable by self or admin" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.current_sop_role() = 'admin');
drop policy if exists "admin manages roles" on public.user_roles;
create policy "admin manages roles" on public.user_roles for all to authenticated
using (public.current_sop_role() = 'admin') with check (public.current_sop_role() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['production_lines','products','production_stages','sop_documents','sop_displays','production_plans','plan_stage_assignments','distribution_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read_authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read_authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_manage_editors', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_manage_sops()) with check (public.can_manage_sops())', t || '_manage_editors', t);
  end loop;
end $$;

drop policy if exists "audit logs read by managers" on public.audit_logs;
create policy "audit logs read by managers" on public.audit_logs for select to authenticated
using (public.current_sop_role() in ('admin','editor'));
drop policy if exists "audit logs append by managers" on public.audit_logs;
create policy "audit logs append by managers" on public.audit_logs for insert to authenticated
with check (public.can_manage_sops() and actor_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_roles, public.production_lines, public.products, public.production_stages, public.sop_documents, public.sop_displays, public.production_plans, public.plan_stage_assignments, public.distribution_events to authenticated;
grant select, insert on public.audit_logs to authenticated;
