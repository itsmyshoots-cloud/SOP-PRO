import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, Bell, BookOpen, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardCheck, Clock3, CloudOff, Cpu, FileCheck2, FileText,
  Gauge, HardDrive, LayoutDashboard, LockKeyhole, LogOut, Menu, Monitor, Package,
  Plus, Radio, RefreshCw, Search, Settings, ShieldCheck, UploadCloud, Wifi, WifiOff, X
} from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';
import './styles.css';

const demoLines = [
  { id:'l1', name:'Assembly Line 01', active:true },
  { id:'l2', name:'Assembly Line 02', active:true },
  { id:'l3', name:'Packing Line 01', active:true },
  { id:'l4', name:'Quality & Testing', active:true }
];
const demoProducts = [
  { id:'p1', model_number:'EA-1500SG', product_name:'Electric Appliance' },
  { id:'p2', model_number:'BTZ032', product_name:'Baby Grooming Kit' },
  { id:'p3', model_number:'BTW72C', product_name:'TWS Earbuds' }
];
const demoStages = [
  {id:'s1',stage_number:1,stage_name:'Incoming material check',product_id:'p1'},
  {id:'s2',stage_number:2,stage_name:'Assembly & fitment',product_id:'p1'},
  {id:'s3',stage_number:3,stage_name:'Electrical safety test',product_id:'p1'},
  {id:'s4',stage_number:4,stage_name:'Final packing',product_id:'p1'}
];
const demoDisplays = [
  {id:'d1',display_code:'DSP-A01',line_id:'l1',device_status:'online'},
  {id:'d2',display_code:'DSP-A02',line_id:'l1',device_status:'online'},
  {id:'d3',display_code:'DSP-A03',line_id:'l1',device_status:'offline'},
  {id:'d4',display_code:'DSP-P01',line_id:'l3',device_status:'online'}
];
const demoPlans = [
  {id:'pl1',plan_date:new Date().toISOString().slice(0,10),line_id:'l1',product_id:'p1',status:'published',version:3,published_at:new Date().toISOString()},
  {id:'pl2',plan_date:new Date().toISOString().slice(0,10),line_id:'l2',product_id:'p2',status:'draft',version:1},
  {id:'pl3',plan_date:new Date().toISOString().slice(0,10),line_id:'l3',product_id:'p3',status:'published',version:2,published_at:new Date().toISOString()}
];
const nav = [
  ['Dashboard',LayoutDashboard],['Today’s Production Plan',ClipboardCheck],['Product & Stage Setup',Package],
  ['SOP Library',BookOpen],['Live SOP Displays',Monitor],['Distribution History',Activity],['Admin & Security',ShieldCheck]
];
const niceDate = new Intl.DateTimeFormat('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());

function App() {
  const [session,setSession] = useState(null);
  const [role,setRole] = useState('viewer');
  const [section,setSection] = useState('Dashboard');
  const [lines,setLines] = useState(demoLines);
  const [products,setProducts] = useState(demoProducts);
  const [stages,setStages] = useState(demoStages);
  const [displays,setDisplays] = useState(demoDisplays);
  const [plans,setPlans] = useState(demoPlans);
  const [docs,setDocs] = useState([]);
  const [events,setEvents] = useState([]);
  const [loading,setLoading] = useState(supabaseConfigured);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [search,setSearch] = useState('');
  const [showCreate,setShowCreate] = useState(false);
  const [mobileNav,setMobileNav] = useState(false);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [planForm,setPlanForm] = useState({plan_date:new Date().toISOString().slice(0,10),line_id:'',product_id:''});
  const [productForm,setProductForm] = useState({model_number:'',product_name:''});
  const [lineForm,setLineForm] = useState({name:''});

  async function refreshData(user = session?.user) {
    if (!supabase || !user) return;
    setLoading(true); setError('');
    const names = [
      ['production_lines','created_at'],['products','created_at'],['production_stages','created_at'],
      ['sop_displays','created_at'],['production_plans','created_at'],['sop_documents','created_at'],
      ['distribution_events','event_at']
    ];
    const results = await Promise.all(names.map(([table,sortColumn]) =>
      supabase.from(table).select('*').order(sortColumn,{ascending:false}).limit(250)
    ));
    const failures = results.filter(r=>r.error);
    if (failures.length) setError(failures[0].error.message);
    const setters = [setLines,setProducts,setStages,setDisplays,setPlans,setDocs,setEvents];
    results.forEach((r,i)=>{ if(!r.error) setters[i](r.data || []); });
    const rr = await supabase.from('user_roles').select('role').eq('user_id',user.id).maybeSingle();
    if (rr.data?.role) setRole(rr.data.role);
    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); if(data.session) refreshData(data.session.user); else setLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next)=>{ setSession(next); if(next) setTimeout(()=>refreshData(next.user),0); else setLoading(false); });
    return ()=>subscription.unsubscribe();
  },[]);

  const publishedPlans = plans.filter(p=>p.status==='published');
  const todayPlans = plans.filter(p=>p.plan_date===new Date().toISOString().slice(0,10));
  const onlineCount = displays.filter(d=>d.device_status==='online').length;
  const offlineCount = displays.filter(d=>d.device_status==='offline').length;
  const filteredPlans = useMemo(()=>plans.filter(p=>{
    const line=lines.find(l=>l.id===p.line_id)?.name||'';
    const product=products.find(x=>x.id===p.product_id);
    return [line,product?.model_number,product?.product_name,p.status].join(' ').toLowerCase().includes(search.toLowerCase());
  }),[plans,lines,products,search]);

  async function signIn(e) {
    e.preventDefault(); setError('');
    const {error:e1} = await supabase.auth.signInWithPassword({email,password});
    if(e1) setError(e1.message);
  }
  async function signOut() { if(supabase) await supabase.auth.signOut(); setSession(null); setRole('viewer'); }
  async function createPlan(e) {
    e.preventDefault();
    if(!planForm.line_id || !planForm.product_id) {setError('Choose both a production line and product.');return;}
    if(supabase && session) {
      const {error:e1}=await supabase.from('production_plans').insert({...planForm,status:'draft',version:1});
      if(e1){setError(e1.message);return;} await refreshData();
    } else {
      const p={...planForm,id:crypto.randomUUID(),status:'draft',version:1,created_at:new Date().toISOString()};
      setPlans(prev=>[p,...prev]);
    }
    setShowCreate(false);setNotice('Draft production plan created. Complete SOP assignments before publishing.');
  }
  async function addProduct(e) {
    e.preventDefault();
    if(!productForm.model_number.trim()||!productForm.product_name.trim()) return;
    if(supabase && session) {
      const {error:e1}=await supabase.from('products').insert(productForm);
      if(e1){setError(e1.message);return;} await refreshData();
    } else setProducts(prev=>[{...productForm,id:crypto.randomUUID()},...prev]);
    setProductForm({model_number:'',product_name:''});setNotice('Product added.');
  }
  async function addLine(e) {
    e.preventDefault(); if(!lineForm.name.trim()) return;
    if(supabase && session) {
      const {error:e1}=await supabase.from('production_lines').insert({name:lineForm.name});
      if(e1){setError(e1.message);return;} await refreshData();
    } else setLines(prev=>[{id:crypto.randomUUID(),name:lineForm.name,active:true},...prev]);
    setLineForm({name:''});setNotice('Production line added.');
  }
  async function publishPlan(plan) {
    if(!supabase || !session) {setError('Connect Supabase and sign in as an authorized SOP editor to publish. Demo mode never publishes to a real device.');return;}
    const {data,error:e1}=await supabase.rpc('publish_sop_plan',{p_plan_id:plan.id});
    if(e1){setError(e1.message);return;}
    setNotice(data?.message || 'Publish request completed. Device acknowledgement is still pending.');
    await refreshData();
  }

  if(supabaseConfigured && !session) return <div className="login-shell"><div className="login-brand"><div className="brand-mark"><BookOpen size={24}/></div><div><strong>SOP-PRO</strong><span>Factory instruction control</span></div></div><div className="login-card"><div className="eyebrow">SECURE WORKSPACE</div><h1>Welcome back</h1><p>Sign in to manage production SOPs and displays.</p><form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@company.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Enter your password"/></label>{error&&<div className="alert danger"><AlertTriangle size={16}/>{error}</div>}<button className="primary full" type="submit">Sign in <ArrowUpRight size={16}/></button></form><div className="login-foot"><LockKeyhole size={14}/> Access is controlled by your factory administrator.</div></div><p className="login-copy">SOP-PRO · Controlled work instructions</p></div>;

  return <div className="app-shell">
    <aside className={'sidebar '+(mobileNav?'mobile-open':'')}>
      <div className="brand"><div className="brand-mark"><BookOpen size={22}/></div><div><strong>SOP-PRO</strong><span>FACTORY CONTROL</span></div><button className="icon-btn close-mobile" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-dot"/><div><b>Factory Workspace</b><small>{supabaseConfigured?(session?'Connected workspace':'Connection configured'):'Preview workspace'}</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div><nav>{nav.map(([label,Icon])=><button key={label} className={'nav-item '+(section===label?'active':'')} onClick={()=>{setSection(label);setMobileNav(false);setError('');}}><Icon size={18}/><span>{label}</span>{label==='Live SOP Displays'&&offlineCount>0&&<em>{offlineCount}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>Need help?</b><p>Check SOP setup and display pairing before publishing.</p><button onClick={()=>setSection('Admin & Security')}>Open setup guide <ArrowUpRight size={14}/></button></div><div className="user-row"><div className="avatar">{(session?.user?.email||'OP').slice(0,2).toUpperCase()}</div><div className="user-info"><b>{session?.user?.email?.split('@')[0]||'Factory operator'}</b><small>{role.toUpperCase()}</small></div>{session&&<button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17}/></button>}</div></div>
    </aside>
    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main">
      <header className="topbar"><div className="top-left"><button className="icon-btn menu-btn" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><div className="breadcrumb">SOP Management <span>/</span> <b>{section}</b></div></div><div className="top-actions"><div className="connection-pill"><span className={'pulse '+(supabaseConfigured?'green':'amber')}/>{supabaseConfigured?'SUPABASE CONFIGURED':'PREVIEW MODE'}</div><button className="icon-btn notification" title="Notifications"><Bell size={18}/><i/></button><div className="date-label"><Clock3 size={15}/>{niceDate}</div></div></header>
      <div className="page">
        {error&&<div className="alert danger"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
        {notice&&<div className="alert success"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {loading&&<div className="loading-bar"><span/></div>}
        {section==='Dashboard'&&<><div className="page-heading"><div><div className="eyebrow">OPERATIONS OVERVIEW</div><h1>Factory dashboard</h1><p>Monitor today's production plan, approved work instructions, and display readiness.</p></div><button className="primary" onClick={()=>{setShowCreate(true);setPlanForm(f=>({...f,line_id:lines[0]?.id||'',product_id:products[0]?.id||''}));}}><Plus size={17}/> Create production plan</button></div>
          {!supabaseConfigured&&<div className="demo-banner"><div><AlertTriangle size={18}/></div><p><b>Preview data</b><span>This workspace is showing sample data. Configure Supabase environment variables and sign in to use live factory records.</span></p><span className="demo-tag">DEMO</span></div>}
          <div className="stats-grid"><Stat icon={ClipboardCheck} label="Today's plans" value={todayPlans.length} foot="Production lines scheduled" tone="blue"/><Stat icon={FileCheck2} label="Published plans" value={publishedPlans.length} foot="Plans with published status" tone="green"/><Stat icon={Wifi} label="Displays online" value={onlineCount} foot={displays.length?Math.round(onlineCount/displays.length*100)+'% of registered displays':'No displays registered'} tone="violet"/><Stat icon={CloudOff} label="Displays offline" value={offlineCount} foot={offlineCount?'Review connection and keep BLOCK visible':'No offline displays in this view'} tone="orange"/></div>
          <div className="content-grid"><section className="panel plan-panel"><div className="panel-heading"><div><h2>Today's production plan</h2><p>Current line assignments and publishing status</p></div><button className="text-btn" onClick={()=>setSection('Today’s Production Plan')}>View all <ArrowUpRight size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>LINE / PRODUCT</th><th>VERSION</th><th>STATUS</th><th></th></tr></thead><tbody>{todayPlans.length?todayPlans.map(p=><PlanRow key={p.id} plan={p} lines={lines} products={products} onPublish={publishPlan}/>):<tr><td colSpan="4"><Empty title="No production plans yet" body="Create a plan to start assigning approved SOPs." action={()=>setShowCreate(true)}/></td></tr>}</tbody></table></div></section>
          <section className="panel readiness-panel"><div className="panel-heading"><div><h2>Display readiness</h2><p>Latest known device connectivity</p></div><Monitor size={19} className="muted"/></div><div className="readiness-number"><strong>{onlineCount}</strong><span>of {displays.length} displays online</span></div><div className="progress-track"><div style={{width:(displays.length?onlineCount/displays.length*100:0)+'%'}}/></div><div className="device-list">{displays.slice(0,4).map(d=><div className="device-row" key={d.id}><div className={'device-icon '+(d.device_status==='online'?'is-online':'is-offline')}><Monitor size={16}/></div><div className="device-name"><b>{d.display_code}</b><small>{lines.find(l=>l.id===d.line_id)?.name||'Unassigned line'}</small></div><span className={'status-dot '+(d.device_status==='online'?'online':'offline')}/><small className={d.device_status==='online'?'status-text':'status-text danger-text'}>{d.device_status==='online'?'Online':'Offline'}</small></div>)}</div><button className="secondary full" onClick={()=>setSection('Live SOP Displays')}>Manage displays <ArrowUpRight size={15}/></button></section></div>
          <div className="bottom-grid"><section className="panel"><div className="panel-heading"><div><h2>Quick access</h2><p>Common SOP management tasks</p></div></div><div className="quick-grid"><Quick icon={Package} title="Products & stages" desc="Set up models and required process steps" onClick={()=>setSection('Product & Stage Setup')}/><Quick icon={UploadCloud} title="SOP library" desc="Review files and revision approval status" onClick={()=>setSection('SOP Library')}/><Quick icon={Radio} title="Display status" desc="Check registered Android screens" onClick={()=>setSection('Live SOP Displays')}/><Quick icon={Activity} title="Distribution history" desc="Review delivery acknowledgements" onClick={()=>setSection('Distribution History')}/></div></section><section className="panel control-panel"><div className="panel-heading"><div><h2>Publishing safeguards</h2><p>Required before a plan can go live</p></div><ShieldCheck size={19} className="muted"/></div><Checklist text="All required stages assigned" /><Checklist text="SOP revision approved" /><Checklist text="Unique display per stage" /><Checklist text="Product and line mapping verified" /><Checklist text="Offline state stays BLOCKED until verified" /></section></div>
        </>}
        {section==='Today’s Production Plan'&&<><div className="page-heading"><div><div className="eyebrow">DAILY SCHEDULING</div><h1>Today's production plan</h1><p>Create plans by production date, line, and product model.</p></div><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> New plan</button></div><div className="filter-bar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search line, model or status"/></div><button className="secondary" onClick={()=>refreshData()} disabled={!session}><RefreshCw size={15}/> Refresh data</button></div><section className="panel"><div className="table-wrap"><table><thead><tr><th>PRODUCTION DATE</th><th>LINE</th><th>PRODUCT / MODEL</th><th>PLAN VERSION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{filteredPlans.map(p=><tr key={p.id}><td>{p.plan_date}</td><td>{lines.find(l=>l.id===p.line_id)?.name||'—'}</td><td><b>{products.find(x=>x.id===p.product_id)?.model_number||'—'}</b><small className="cell-sub">{products.find(x=>x.id===p.product_id)?.product_name}</small></td><td>v{p.version||1}</td><td><Status status={p.status}/></td><td><button className="small-action" onClick={()=>publishPlan(p)} disabled={p.status==='published'}>Publish preflight <ArrowUpRight size={14}/></button></td></tr>)}{!filteredPlans.length&&<tr><td colSpan="6"><Empty title="No matching plans" body="Create a production plan or change the search." action={()=>setShowCreate(true)}/></td></tr>}</tbody></table></div><div className="panel-foot"><span>{filteredPlans.length} plans shown</span><span>Offline devices may remain pending after publish.</span></div></section></>}
        {section==='Product & Stage Setup'&&<><div className="page-heading"><div><div className="eyebrow">CONFIGURATION</div><h1>Product & stage setup</h1><p>Maintain model numbers, production lines, and required process stages.</p></div></div><div className="form-columns"><section className="panel"><div className="panel-heading"><div><h2>Add product model</h2><p>Register a product before configuring its stages.</p></div><Package size={19} className="muted"/></div><form className="inline-form" onSubmit={addProduct}><label>Model number<input value={productForm.model_number} onChange={e=>setProductForm({...productForm,model_number:e.target.value})} placeholder="e.g. EA-1500SG" required/></label><label>Product name<input value={productForm.product_name} onChange={e=>setProductForm({...productForm,product_name:e.target.value})} placeholder="Product name" required/></label><button className="primary" type="submit"><Plus size={16}/> Add product</button></form><div className="simple-list">{products.map(p=><div className="simple-row" key={p.id}><div className="product-mini"><Package size={17}/></div><div><b>{p.model_number}</b><small>{p.product_name}</small></div><span className="count-pill">{stages.filter(s=>s.product_id===p.id).length} stages</span></div>)}</div></section><section className="panel"><div className="panel-heading"><div><h2>Production lines</h2><p>Manage the line names used for assignments.</p></div><Gauge size={19} className="muted"/></div><form className="line-form" onSubmit={addLine}><input value={lineForm.name} onChange={e=>setLineForm({name:e.target.value})} placeholder="e.g. Assembly Line 03" required/><button className="primary" type="submit"><Plus size={16}/> Add line</button></form><div className="simple-list">{lines.map(l=><div className="simple-row" key={l.id}><div className="product-mini line-mini"><Activity size={17}/></div><div><b>{l.name}</b><small>{displays.filter(d=>d.line_id===l.id).length} registered displays</small></div><span className="live-label"><span/>Active</span></div>)}</div><div className="info-note"><AlertTriangle size={16}/><span>Stage records and approved SOP assignments are managed by authorized editors. A plan cannot publish until all required stages are assigned.</span></div></section></div><section className="panel stages-panel"><div className="panel-heading"><div><h2>Configured stages</h2><p>Stages currently registered per product</p></div><span className="count-pill">{stages.length} total</span></div><div className="table-wrap"><table><thead><tr><th>MODEL</th><th>STAGE</th><th>STAGE NAME</th><th>REQUIREMENT</th></tr></thead><tbody>{stages.map(s=><tr key={s.id}><td>{products.find(p=>p.id===s.product_id)?.model_number||'—'}</td><td><span className="stage-num">{String(s.stage_number).padStart(2,'0')}</span></td><td><b>{s.stage_name}</b></td><td><Status status={s.required===false?'optional':'required'}/></td></tr>)}</tbody></table></div></section></>}
        {section==='SOP Library'&&<><div className="page-heading"><div><div className="eyebrow">CONTROLLED DOCUMENTS</div><h1>SOP library</h1><p>Track SOP revisions and approval before assigning them to a live plan.</p></div><label className="primary upload-btn"><UploadCloud size={17}/> Upload SOP<input type="file" accept=".pdf,image/*,video/*" onChange={e=>{const f=e.target.files?.[0];if(f)setNotice('Selected '+f.name+'. Upload storage and revision approval need to be configured before this file can be published.');}}/></label></div><div className="demo-banner soft"><div><FileText size={18}/></div><p><b>Document controls</b><span>Approved revisions only can be published. Connect private Supabase Storage and an approval workflow before uploading production instructions.</span></p></div><section className="panel"><div className="panel-heading"><div><h2>Document revisions</h2><p>Latest SOP records from the workspace</p></div><div className="searchbox compact"><Search size={16}/><input placeholder="Search documents" onChange={e=>setSearch(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>DOCUMENT</th><th>PRODUCT / STAGE</th><th>REVISION</th><th>APPROVAL</th><th>UPLOADED</th></tr></thead><tbody>{docs.filter(d=>(d.title+' '+d.file_name).toLowerCase().includes(search.toLowerCase())).map(d=><tr key={d.id}><td><div className="file-cell"><div className="file-icon"><FileText size={17}/></div><div><b>{d.title}</b><small>{d.file_name}</small></div></div></td><td>{products.find(p=>p.id===d.product_id)?.model_number||'General'}<small className="cell-sub">{stages.find(s=>s.id===d.stage_id)?.stage_name||'Not stage-linked'}</small></td><td><span className="revision-pill">{d.revision}</span></td><td><Status status={d.status}/></td><td>{d.created_at?.slice(0,10)||'—'}</td></tr>)}{!docs.length&&<tr><td colSpan="5"><Empty title="No SOP documents registered" body="Upload an SOP and route it for approval before publishing a production plan."/></td></tr>}</tbody></table></div></section></>}
        {section==='Live SOP Displays'&&<><div className="page-heading"><div><div className="eyebrow">DEVICE MONITORING</div><h1>Live SOP displays</h1><p>Review Android display status and the last known delivery state.</p></div><button className="secondary" onClick={()=>refreshData()} disabled={!session}><RefreshCw size={15}/> Refresh</button></div><div className="demo-banner danger-banner"><div><AlertTriangle size={18}/></div><p><b>Offline safety policy: BLOCK</b><span>A display must retain the last verified SOP and show a prominent BLOCKED warning while offline. Reconnecting to Wi-Fi alone never confirms that the current approved plan is applied.</span></p></div><div className="display-grid">{displays.map(d=>{const line=lines.find(l=>l.id===d.line_id);const plan=publishedPlans.find(p=>p.line_id===d.line_id);return <div className="display-card" key={d.id}><div className="display-card-top"><div className={'big-device-icon '+(d.device_status==='online'?'is-online':'is-offline')}><Monitor size={22}/></div><Status status={d.device_status}/></div><h3>{d.display_code}</h3><p>{line?.name||'Unassigned line'}</p><div className="display-meta"><span>Current plan</span><b>{plan?'v'+plan.version:'Not assigned'}</b></div><div className="display-meta"><span>Last confirmation</span><b>{d.last_seen_at?new Date(d.last_seen_at).toLocaleString():'Not reported'}</b></div>{d.device_status==='offline'?<div className="blocked-label"><LockKeyhole size={14}/> BLOCKED · VERIFY PLAN</div>:<div className="ready-label"><CheckCircle2 size={14}/> Connection available · plan receipt unverified</div>}</div>})}</div>{!displays.length&&<section className="panel"><Empty title="No displays registered" body="Pair each Android display with a unique Display ID and stage assignment."/></section>}</>}
        {section==='Distribution History'&&<><div className="page-heading"><div><div className="eyebrow">AUDIT TRAIL</div><h1>Distribution history</h1><p>Device delivery states are tracked individually; a publish does not imply receipt.</p></div><button className="secondary" onClick={()=>refreshData()} disabled={!session}><RefreshCw size={15}/> Refresh</button></div><section className="panel"><div className="panel-heading"><div><h2>Device delivery events</h2><p>Pending → Downloading → Verified → Applied → Acknowledged</p></div><Activity size={19} className="muted"/></div><div className="table-wrap"><table><thead><tr><th>TIME</th><th>PLAN</th><th>DISPLAY</th><th>DELIVERY STATUS</th><th>DETAIL</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{e.event_at?new Date(e.event_at).toLocaleString():'—'}</td><td>{plans.find(p=>p.id===e.plan_id)?.plan_date||'—'}<small className="cell-sub">{plans.find(p=>p.id===e.plan_id)?.id?.slice(0,8)||''}</small></td><td>{displays.find(d=>d.id===e.display_id)?.display_code||'—'}</td><td><Status status={e.status}/></td><td>{e.detail||'—'}</td></tr>)}{!events.length&&<tr><td colSpan="5"><Empty title="No delivery events yet" body="Publishing a validated plan creates Pending delivery records. Devices must acknowledge receipt separately."/></td></tr>}</tbody></table></div></section></>}
        {section==='Admin & Security'&&<><div className="page-heading"><div><div className="eyebrow">ACCESS & SYSTEM HEALTH</div><h1>Admin & security</h1><p>Role-based access, publish validation, and factory display safety rules.</p></div></div><div className="security-grid"><section className="panel"><div className="panel-heading"><div><h2>Current access</h2><p>Supabase authenticated workspace</p></div><ShieldCheck size={20} className="muted"/></div><div className="security-row"><div className="security-icon"><LockKeyhole size={18}/></div><div><b>Role-based permissions</b><small>Admin / Editor / Viewer / Device</small></div><Status status={session?'active':'preview'}/></div><div className="security-row"><div className="security-icon"><HardDrive size={18}/></div><div><b>Database access rules</b><small>Row Level Security on business tables</small></div><Status status={supabaseConfigured?'configured':'preview'}/></div><div className="security-row"><div className="security-icon"><FileCheck2 size={18}/></div><div><b>Approved revision gate</b><small>Publish procedure rejects unapproved SOP documents</small></div><Status status="enabled"/></div></section><section className="panel"><div className="panel-heading"><div><h2>Operational rules</h2><p>Safety requirements for production rollout</p></div><AlertTriangle size={20} className="muted"/></div>{['Central publish is the default; manual overrides require a reason.','A stage can be assigned to one display per plan.','Publish validation blocks missing required stages and unapproved revisions.','Offline display keeps the last verified SOP but remains visibly BLOCKED.','Only a verified current plan and file checksum can clear the device block.','Service-role secrets stay server-side and out of the repository.'].map(t=><Checklist key={t} text={t}/>)}</section></div><section className="panel setup-panel"><div className="panel-heading"><div><h2>Deployment configuration</h2><p>Required environment variables for a Vercel deployment.</p></div></div><div className="env-row"><code>VITE_SUPABASE_URL</code><span>{supabaseConfigured?'Configured in current session':'Missing'}</span></div><div className="env-row"><code>VITE_SUPABASE_ANON_KEY</code><span>{supabaseConfigured?'Configured in current session':'Missing'}</span></div><div className="info-note"><CircleHelp size={16}/><span>Set these values in Vercel Project Settings → Environment Variables. Never expose a service-role key to the browser. Admin role assignment should be done by a trusted administrator in Supabase, not by a self-service UI.</span></div></section></>}
      </div><footer className="footer"><span>© {new Date().getFullYear()} SOP-PRO · Factory instruction control</span><span><span className="footer-dot"/> Controlled workspace</span></footer>
    </main>
    {showCreate&&<div className="modal-backdrop" onClick={()=>setShowCreate(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">NEW PLAN</div><h2>Create production plan</h2><p>Choose the target date, line, and product.</p></div><button className="icon-btn" onClick={()=>setShowCreate(false)}><X size={18}/></button></div><form onSubmit={createPlan}><label>Production date<input type="date" value={planForm.plan_date} onChange={e=>setPlanForm({...planForm,plan_date:e.target.value})} required/></label><label>Production line<select value={planForm.line_id} onChange={e=>setPlanForm({...planForm,line_id:e.target.value})} required><option value="">Select a line</option>{lines.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Product / model<select value={planForm.product_id} onChange={e=>setPlanForm({...planForm,product_id:e.target.value})} required><option value="">Select a product</option>{products.map(p=><option key={p.id} value={p.id}>{p.model_number} — {p.product_name}</option>)}</select></label><div className="modal-note"><AlertTriangle size={16}/><span>Plan remains a draft until every required stage has an approved SOP and unique display assignment.</span></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary" type="submit">Create draft <ArrowUpRight size={16}/></button></div></form></div></div>}
  </div>;
}
function Stat({icon:Icon,label,value,foot,tone}){return <div className="stat-card"><div className="stat-top"><div className={'stat-icon '+tone}><Icon size={19}/></div><span className="stat-kicker">LIVE</span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-foot">{foot}</div></div>}
function Status({status}){const s=String(status||'unknown').toLowerCase().replaceAll(' ','_');let label=String(status||'Unknown').replaceAll('_',' ');return <span className={'status-badge '+(['published','approved','online','active','enabled','acknowledged','verified'].includes(s)?'good':['draft','pending','in_review','unknown','preview','downloading'].includes(s)?'warning':['offline','blocked','failed','retired','superseded'].includes(s)?'bad':'neutral')}><i/>{label}</span>}
function PlanRow({plan,lines,products,onPublish}){const product=products.find(p=>p.id===plan.product_id);return <tr><td><div className="line-cell"><div className="line-avatar"><Activity size={16}/></div><div><b>{lines.find(l=>l.id===plan.line_id)?.name||'—'}</b><small>{product?.model_number||'Product not found'} · {product?.product_name||''}</small></div></div></td><td><span className="revision-pill">v{plan.version||1}</span></td><td><Status status={plan.status}/></td><td>{plan.status!=='published'&&<button className="row-action" onClick={()=>onPublish(plan)} title="Run publish validation"><ArrowUpRight size={16}/></button>}</td></tr>}
function Empty({title,body,action}){return <div className="empty-state"><div className="empty-icon"><FileText size={21}/></div><b>{title}</b><p>{body}</p>{action&&<button className="secondary" onClick={action}><Plus size={15}/> Create plan</button>}</div>}
function Quick({icon:Icon,title,desc,onClick}){return <button className="quick-item" onClick={onClick}><div className="quick-icon"><Icon size={19}/></div><div><b>{title}</b><p>{desc}</p></div><ArrowUpRight size={15} className="quick-arrow"/></button>}
function Checklist({text}){return <div className="check-row"><span><CheckCircle2 size={16}/></span><p>{text}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);