# SOP-PRO

Centralized factory Standard Operating Procedure (SOP) planning, assignment, publishing, and Android display monitoring.

## Stack
- React + Vite
- Supabase Auth + PostgreSQL with Row Level Security
- Vercel-ready static frontend

## Local setup
1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
3. Run `npm install`, then `npm run dev`.
4. Run the SQL migration in `supabase/migrations/001_sop_pro.sql` (already applied to the connected project when provisioned through this setup).
5. In Supabase Authentication, create authorized user accounts. To grant an admin, update that user's row in `public.user_roles` through the SQL editor using a trusted administrator.

## Vercel
Import this GitHub repository into Vercel and set the two environment variables above. Build command: `npm run build`; output directory: `dist`.

## Safety / production notes
- Never place Supabase service-role keys in frontend variables or commit them to GitHub.
- Offline displays must keep the last verified SOP visible while prominently showing BLOCKED until the latest plan and file integrity have been confirmed. Wi-Fi reconnection alone must not clear the block.
- This initial web release establishes plan, stage, SOP revision, and distribution-history foundations. Android kiosk pairing, signed file checksums, device heartbeats and delivery acknowledgements need the companion display client before factory rollout.
- Enable MFA and invite only authorized staff before production use.