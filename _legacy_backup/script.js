let globalUsers = [];
let globalLeads = [];
let globalUnassignedLeads = [];
let globalReminders = [];
let currentLeadPage = 1;
let leadsPerPage = 10;
let totalLeadPages = 1;
let reminderCheckInterval = null;
let currentUser = null;
let chaseTimerInterval = null;
let latestAnalytics = null;

const REPORT_MANAGEMENT_ROLES = ['superadmin', 'super_admin', 'admin', 'manager'];

const DISPOSITIONS = [
  "Pending",
  "Customer Doesn't Qualify",
  "Customer Didn't Pick Up",
  "Customer Not Interested",
  "Customer On Call",
  "Customer Re-scheduled",
  "Customer Form Completed",
  "Customer Form Sent",
  "Customer Form Received",
  "Deal Closed / Won",
  "Follow-up Required",
  "Not Interested / Lost"
];

const CLOSER_DISPOSITIONS = [
  "Customer Doesn't Qualify",
  "Customer Didn't Pick Up",
  "Customer Not Interested",
  "Customer On Call",
  "Customer Re-scheduled",
  "Customer Form Completed"
];

// Exact daily booking slots required
const BOOKING_SLOTS = [
  "9:15 AM",
  "10:15 AM",
  "11:30 AM",
  "12:45 PM",
  "1:45 PM",
  "3:00 PM",
  "4:15 PM",
  "5:00 PM"
];

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (token && user) {
    showDashboard(user);
  } else {
    showLogin();
  }
});

async function handleLogin(e) {
  e.preventDefault();
  const errorBox = document.getElementById('login-error');
  if (errorBox) errorBox.classList.add('hidden');

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Invalid login credentials');

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    showDashboard(data.user);
  } catch (err) {
    if (errorBox) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    } else {
      alert(err.message);
    }
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  if (reminderCheckInterval) clearInterval(reminderCheckInterval);
  showLogin();
}

function showLogin() {
  document.getElementById('login-section')?.classList.remove('hidden');
  document.getElementById('dashboard-section')?.classList.add('hidden');
  document.getElementById('reports-view')?.classList.add('hidden');
  document.getElementById('agents-view')?.classList.add('hidden');
  document.getElementById('slot-dashboard-view')?.classList.add('hidden');
  document.getElementById('user-info')?.classList.add('hidden');
}



function renderCRMShell(user){
  const dash=document.getElementById('dashboard-section');
  if(!dash) return;
  let root=document.getElementById('v4-app-shell');
  if(!root){
    root=document.createElement('div');
    root.id='v4-app-shell';
    root.className='v4-app-shell';
    dash.prepend(root);
  }
  // Keep the legacy DOM alive for the existing API/render functions, but remove it from the visual workspace.
  Array.from(dash.children).forEach(ch=>{ if(ch!==root) ch.classList.add('v4-legacy-hidden'); });
  const role=String(user.role||'').toLowerCase();
  const name=user.full_name||user.name||user.email||'User';
  const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'VN';
  const isMgmt=['admin','superadmin','super_admin','manager'].includes(role);
  const nav=[
    ['overview','Overview','▦'],['leads','Lead Queue','◉'],
    ...(role==='chase'?[['chase','Chase Operations','⏱']]:[]),
    ...(isMgmt?[['intelligence','AI Intelligence','✦'],['team','Team Control','♙']]:[]),
    ...(role==='closer'?[['closer','Closer Queue','◎']]:[]),
    ['reports','Reports','▥']
  ];
  root.innerHTML=`
    <div class="v4-layout">
      <aside class="v4-sidebar">
        <div class="v4-brand"><div class="v4-brand-mark">VN</div><div><b>VOICE NATION</b><span>VISION CRM 4.0</span></div></div>
        <div class="v4-status"><i></i> LIVE OPERATIONS</div>
        <div class="v4-nav">${nav.map((n,i)=>`<button class="v4-nav-btn ${i===0?'active':''}" data-view="${n[0]}" onclick="v4Navigate('${n[0]}',this)"><span>${n[2]}</span>${n[1]}</button>`).join('')}</div>
        <div class="v4-side-bottom"><div class="v4-user"><div class="v4-avatar">${initials}</div><div><b>${name}</b><small>${role.replace(/_/g,' ').toUpperCase()}</small></div></div><button class="v4-signout" onclick="logout()">Sign out securely</button></div>
      </aside>
      <section class="v4-main">
        <header class="v4-topbar"><div><small>VOICE NATION • SECURE OPERATIONS</small><h1 id="v4-page-title">${role==='fronter'?'Fronter Command Center':role==='closer'?'Closer Control Room':role==='chase'?'Chase Operations':'Management Control Center'}</h1></div><div class="v4-top-actions"><span class="v4-live-pill"><i></i> LIVE</span><button onclick="toggleTheme()" class="v4-icon-btn" title="Toggle light/dark mode">◐</button></div></header>
        <div id="v4-overdue-top" class="v4-overdue-top">🚨 <span id="v4-overdue-count">0</span> OVERDUE CHASE TASKS — ACTION REQUIRED</div>
        <main id="v4-view-root"></main>
      </section>
    </div>`;
  v4RenderView('overview');
}

function v4Navigate(view,btn){
  document.querySelectorAll('.v4-nav-btn').forEach(b=>b.classList.remove('active'));
  btn?.classList.add('active');
  v4RenderView(view);
}

function renderV4RoleWorkspace(user){
  // Kept as a compatibility entry point; the real workspace is rendered by renderCRMShell.
  if(!document.getElementById('v4-app-shell')) renderCRMShell(user);
  v4Update();
}

function v4RenderView(view){
  const root=document.getElementById('v4-view-root'); if(!root) return;
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  const role=String(user.role||'').toLowerCase();
  const isFronter=role==='fronter'||role==='fronting', isCloser=role==='closer', isChase=role==='chase', isMgmt=['admin','superadmin','super_admin','manager'].includes(role);
  const title=document.getElementById('v4-page-title');
  const titles={overview:'Overview',leads:'Lead Queue',chase:'Chase Operations',intelligence:'AI Intelligence',team:'Team Control',closer:'Closer Queue',reports:'Performance Reports'};
  if(title) title.textContent=titles[view]||'Operations Workspace';
  if(view==='overview') root.innerHTML=v4OverviewHTML(role,user);
  else if(view==='leads'||view==='closer') root.innerHTML=v4LeadHTML(role, user, view==='closer'?'mine':'all');
  else if(view==='chase') root.innerHTML=v4ChaseHTML();
  else if(view==='intelligence'||view==='reports') root.innerHTML=v4IntelligenceHTML();
  else if(view==='team') root.innerHTML=v4TeamHTML();
  v4Update();
}

function v4OverviewHTML(role,user){
  const isChase=role==='chase', isFronter=role==='fronter'||role==='fronting';
  return `<div class="v4-eyebrow">VISION CRM 4.0 • LIVE WORKSPACE</div>
  <div class="v4-hero-grid"><div class="v4-hero-card"><span>${isChase?'CHASE SLA COMMAND CENTER':isFronter?'FRONTER SUBMISSION CONTROL':'OPERATIONS CONTROL CENTER'}</span><h2>${isChase?'Protect every deadline.':isFronter?'Submit once. Stay locked.':'Move every lead through the pipeline.'}</h2><p>${isChase?'24-hour physical-form SLA followed by a 7-day customer-return SLA.':isFronter?'Your submitted leads are immutable. Track closer outcomes and completion ratio.':'Assignment, disposition, ownership and SLA visibility in one command center.'}</p></div>
  ${['My / Pipeline Leads','Completed Outcomes','Completion Ratio','SLA Attention'].map((x,i)=>`<div class="v4-kpi"><small>${x}</small><strong id="v4-kpi-${i+1}">0</strong><span>${i===3?'Requires attention':'Live metric'}</span></div>`).join('')}</div>
  <div class="v4-grid-2"><section class="v4-card"><div class="v4-card-head"><div><b>Pipeline Snapshot</b><span>Current workflow state</span></div><button class="v4-small-btn" onclick="v4Navigate('leads',document.querySelector('[data-view=leads]'))">Open queue →</button></div><div id="v4-snapshot"></div></section>
  <section class="v4-card ${isChase?'v4-ai-card':''}"><div class="v4-card-head"><div><b>${isChase?'Chase SLA Health':'Operational Health'}</b><span>Real-time attention signals</span></div></div><div id="v4-health"></div></section></div>`;
}
function v4LeadHTML(role,user,mode){
  const closer=role==='closer';
  return `<div class="v4-toolbar"><div><div class="v4-eyebrow">${closer?(mode==='mine'?'MY ASSIGNED LEADS':'CLOSER NETWORK'):'ACTIVE LEAD QUEUE'}</div><h2>${closer?'Closer Queue':'Lead Operations'}</h2></div><div class="v4-toolbar-actions">${closer?`<button class="v4-small-btn active" onclick="v4Queue('mine');v4RenderView('closer')">MY LEADS</button><button class="v4-small-btn" onclick="v4Queue('others');v4RenderView('closer')">OTHER CLOSERS · VIEW ONLY</button>`:''}<button class="v4-small-btn" onclick="fetchLeads(1);v4Update()">↻ Refresh</button></div></div>
  <section class="v4-card"><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Customer</th><th>Owner</th><th>Disposition</th><th>SLA</th><th>Access</th></tr></thead><tbody id="v4-leads-body"></tbody></table></div></section>`;
}
function v4ChaseHTML(){return `<div class="v4-toolbar"><div><div class="v4-eyebrow">CHASE OPERATIONS</div><h2>Form SLA Command Center</h2></div><div class="v4-danger-summary" id="v4-chase-danger">0 overdue</div></div><div class="v4-sla-banner"><div><b>24H PHYSICAL FORM SLA</b><span>Customer Form Completed → Customer Form Sent</span></div><div><b>7D CUSTOMER RETURN SLA</b><span>Customer Form Sent → Customer Form Received</span></div></div><section class="v4-card"><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Customer</th><th>Stage</th><th>Countdown</th><th>Status</th><th>Action</th></tr></thead><tbody id="v4-leads-body"></tbody></table></div></section>`}
function v4IntelligenceHTML(){return `<div class="v4-toolbar"><div><div class="v4-eyebrow">AI OPERATIONS</div><h2>Chase Intelligence</h2></div></div><div class="v4-ai-grid"><div class="v4-card"><b>SLA Health</b><strong id="v4-ai-score">0%</strong><span>Based on current workflow compliance</span></div><div class="v4-card"><b>Overdue Risk</b><strong id="v4-ai-risk">0</strong><span>Leads requiring intervention</span></div><div class="v4-card"><b>Recommended Action</b><p id="v4-ai-action">Analyzing queue...</p></div></div><section class="v4-card"><div class="v4-card-head"><div><b>At-Risk Queue</b><span>Priority signals generated from SLA state</span></div></div><div id="v4-ai-list" class="v4-ai-list"></div></section>`}
function v4TeamHTML(){return `<div class="v4-toolbar"><div><div class="v4-eyebrow">MANAGEMENT</div><h2>Team Control</h2></div></div><section class="v4-card"><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Agent</th><th>Role</th><th>Active Leads</th><th>Performance</th></tr></thead><tbody id="v4-team-body"></tbody></table></div></section>`}
function v4RenderRows(){
  const body=document.getElementById('v4-leads-body'); if(!body) return;
  const user=JSON.parse(localStorage.getItem('user')||'{}'), role=String(user.role||'').toLowerCase();
  const rows=globalLeads||[];
  body.innerHTML=rows.map(l=>{const due=getLeadDueMs(l), overdue=due<0 && ['Customer Form Completed','Customer Form Sent'].includes(l.status), own=role==='closer'?!!l.is_own_closer_lead:role==='chase'?!!l.is_own_chase_lead:true;
    const countdown=['Customer Form Completed','Customer Form Sent'].includes(l.status)?renderLeadTimer(l):'—';
    let control=`<span class="v4-status">${l.status||'Pending'}</span>`;
    if(role==='closer'&&own) control=`<select class="v4-select" onchange="updateLeadStatus(${l.id},this.value)">${CLOSER_DISPOSITIONS.map(d=>`<option ${l.status===d?'selected':''}>${d}</option>`).join('')}</select>`;
    if(role==='chase'&&own) { const opts=l.status==='Customer Form Completed'?['Customer Form Sent']:l.status==='Customer Form Sent'?['Customer Form Received']:[]; if(opts.length) control=`<select class="v4-select" onchange="updateLeadStatus(${l.id},this.value)"><option value="">Update stage…</option>${opts.map(d=>`<option>${d}</option>`).join('')}</select>`; }
    return `<tr class="${overdue?'v4-row-overdue':''}"><td><b>${l.customer_name||'Unknown'}</b><small>#${l.id} · ${l.phone_number||'No phone'}</small></td><td>${l.closer_name||'Unassigned'}<small>${l.chase_agent_name?'Chase: '+l.chase_agent_name:'Chase queue'}</small></td><td>${control}</td><td>${countdown}</td><td>${own&&role!=='fronter'?'<span class="v4-access own">EDIT</span>':'<span class="v4-access">VIEW ONLY</span>'}</td></tr>`}).join('')||`<tr><td colspan="5" class="v4-empty">No leads in this queue.</td></tr>`;
}
function v4Update(){
  const s=latestAnalytics||{}, user=JSON.parse(localStorage.getItem('user')||'{}'), role=String(user.role||'').toLowerCase();
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('v4-kpi-1',s.totalLeads??globalLeads.length??0); set('v4-kpi-2',s.completedLeads??0); set('v4-kpi-3',`${s.completionRate??0}%`); set('v4-kpi-4',s.chaseOverdue??0);
  const overdue=Number(s.chaseOverdue||0), top=document.getElementById('v4-overdue-top'); if(top){top.classList.toggle('show',overdue>0 && (role==='chase'||['admin','superadmin','super_admin','manager'].includes(role))); set('v4-overdue-count',overdue)}
  const danger=document.getElementById('v4-chase-danger'); if(danger) danger.textContent=`${overdue} overdue`;
  v4RenderRows();
  const snap=document.getElementById('v4-snapshot'); if(snap) snap.innerHTML=`<div class="v4-progress-row"><span>Submitted</span><b>${s.totalLeads??globalLeads.length}</b></div><div class="v4-progress-row"><span>Completed</span><b>${s.completedLeads??0}</b></div><div class="v4-progress-row"><span>Chase overdue</span><b class="${overdue?'danger':''}">${overdue}</b></div>`;
  const health=document.getElementById('v4-health'); if(health) health.innerHTML=`<div class="v4-health-score">${s.completionRate??0}%</div><p>Completion ratio across the visible workflow.</p><div class="v4-mini-alert ${overdue?'danger':''}">${overdue?`⚠ ${overdue} lead(s) need immediate SLA attention.`:'✓ No active overdue alerts.'}</div>`;
  set('v4-ai-score',`${s.chaseSlaRate??s.completionRate??0}%`); set('v4-ai-risk',overdue); const act=document.getElementById('v4-ai-action'); if(act) act.textContent=overdue?`Prioritize ${overdue} overdue chase item(s) and rebalance workload.`:'No urgent intervention detected. Continue monitoring the SLA queue.';
  const ail=document.getElementById('v4-ai-list'); if(ail) ail.innerHTML=(globalLeads||[]).filter(l=>getLeadDueMs(l)<0 && ['Customer Form Completed','Customer Form Sent'].includes(l.status)).slice(0,10).map(l=>`<div><b>${l.customer_name}</b><span> · ${l.status} · OVERDUE</span></div>`).join('')||'<div>No high-risk leads detected.</div>';
  const team=document.getElementById('v4-team-body'); if(team) team.innerHTML=(globalUsers||[]).map(u=>{const n=(globalLeads||[]).filter(l=>Number(l.assigned_to)===Number(u.id)||Number(l.chase_assigned_to)===Number(u.id)).length; return `<tr><td><b>${u.full_name||u.email}</b></td><td>${String(u.role||'').toUpperCase()}</td><td>${n}</td><td>${n?Math.max(0,100-Math.min(n*3,60))+'%':'—'}</td></tr>`}).join('');
}
function v4Queue(mode){
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  if(user.role==='closer'){
    const mine=globalLeads.filter(l=>l.is_own_closer_lead);
    const others=globalLeads.filter(l=>!l.is_own_closer_lead);
    globalLeads=(mode==='others'?others:mine);
  }else if(user.role==='chase' && mode==='overdue'){
    globalLeads=globalLeads.filter(l=>['Customer Form Completed','Customer Form Sent'].includes(l.status) && getLeadDueMs(l)<0);
  }
  renderLeads();
}
function getLeadDueMs(l){
  const due=l.status==='Customer Form Sent'?l.chase_return_due_at:l.chase_due_at;
  return due?new Date(due).getTime()-Date.now():999999999999;
}
function v4Update(){
  const s=latestAnalytics||{};
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  const role=String(user.role||'').toLowerCase();
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('v4-kpi-1', role==='fronter' ? (s.totalLeads??globalLeads.length) : (s.totalLeads??globalLeads.length));
  set('v4-kpi-2', role==='fronter' ? (s.completedLeads??0) : (s.closedDeals??s.completedLeads??0));
  set('v4-kpi-3', role==='chase' ? `${s.chaseSlaRate??s.completionRate??0}%` : `${s.completionRate??0}%`);
  set('v4-kpi-4', s.chaseOverdue??0);
  const overdue=Number(s.chaseOverdue||0);
  const top=document.getElementById('v4-overdue-top'), cnt=document.getElementById('v4-overdue-count');
  if(top){top.classList.toggle('show',role==='chase'&&overdue>0);if(cnt)cnt.textContent=overdue}
  const list=document.getElementById('v4-sla-list');
  if(list){
    if(role==='chase'){
      const active=globalLeads.filter(l=>['Customer Form Completed','Customer Form Sent'].includes(l.status));
      const overdueCount=active.filter(l=>getLeadDueMs(l)<0).length;
      const due24=active.filter(l=>l.status==='Customer Form Completed' && getLeadDueMs(l)>=0).length;
      const due7=active.filter(l=>l.status==='Customer Form Sent' && getLeadDueMs(l)>=0).length;
      list.innerHTML=`<div class="v4-sla ${overdueCount?'overdue':''}"><strong>🔴 Overdue</strong><span>${overdueCount}</span></div>
      <div class="v4-sla"><strong>⏱ 24H Form Send</strong><span>${due24}</span></div>
      <div class="v4-sla"><strong>📦 7D Form Return</strong><span>${due7}</span></div>`;
    }else{
      list.innerHTML=`<div class="v4-sla"><strong>Pipeline</strong><span>${s.totalLeads??globalLeads.length}</span></div>
      <div class="v4-sla"><strong>Completed</strong><span>${s.completedLeads??0}</span></div>
      <div class="v4-sla ${Number(s.chaseOverdue||0)>0?'overdue':''}"><strong>SLA Attention</strong><span>${s.chaseOverdue??0}</span></div>`;
    }
  }
}
function updateCRMKPIs(stats){
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  const role=(user.role||'').toLowerCase();
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val??0};
  set('crm-kpi-leads', stats?.totalLeads??globalLeads.length??0);
  set('crm-kpi-completed', stats?.completedLeads??0);
  set('crm-kpi-overdue', stats?.chaseOverdue??0);
  set('crm-kpi-rate', `${stats?.completionRate??0}%`);
  const grid=document.getElementById('crm-role-kpis');
  if(grid) grid.classList.toggle('hidden', role==='fronter');
}

function showDashboard(user) {
  currentUser = user;
  renderCRMShell(user);
  renderV4RoleWorkspace(user);
  document.getElementById('login-section')?.classList.add('hidden');
  document.getElementById('dashboard-section')?.classList.remove('hidden');
  document.getElementById('user-info')?.classList.remove('hidden');
  document.getElementById('user-display').textContent = `${user.full_name || user.name || user.email} (${(user.role || '').toUpperCase()})`;

  applyRolePermissions(user);
  fetchAIInsights();
  fetchAnalytics();
  fetchUsers();
  injectFilterAndExportUI();
  setupSearchListener();
  fetchLeads(1);
  fetchUnassignedLeads();
  fetchReminders();

  if (reminderCheckInterval) clearInterval(reminderCheckInterval);
  reminderCheckInterval = setInterval(() => {
    fetchReminders();
    renderLeads();
    fetchAnalytics();
  }, 30000);

  if (chaseTimerInterval) clearInterval(chaseTimerInterval);
  chaseTimerInterval = setInterval(() => {
    renderLeads();
    renderChaseOverdueBanner();
    v4Update();
  }, 1000);

  const role = (user.role || '').toLowerCase();
  if (REPORT_MANAGEMENT_ROLES.includes(role) || role === 'chase') {
    fetchAuditLogs();
  }
  if (role === 'chase' || REPORT_MANAGEMENT_ROLES.includes(role)) {
    fetchChaseAIReport();
    setInterval(() => fetchChaseAIReport(), 60000);
  }
}

function applyRolePermissions(user) {
  const role = (user.role || '').toLowerCase();
  const addLeadSec = document.getElementById('add-lead-section');
  const auditSec = document.getElementById('audit-trail-section');

  const isSuperAdmin = role === 'superadmin' || role === 'super_admin';
  const isFronter = role === 'fronter' || role === 'fronting';
  const isChase = role === 'chase';

  const fronterSummary = document.getElementById('fronter-summary');
  if (fronterSummary) {
    fronterSummary.classList.toggle('hidden', !isFronter);
  }

  const agentNavBtn = document.getElementById('nav-agents-btn');
  if (agentNavBtn) {
    if (isSuperAdmin || role === 'admin') {
      agentNavBtn.classList.remove('hidden');
      agentNavBtn.style.display = '';
    } else {
      agentNavBtn.classList.add('hidden');
      agentNavBtn.style.display = 'none';
    }
  }

  if (addLeadSec) {
    addLeadSec.style.display = (isSuperAdmin || isFronter) ? 'block' : 'none';
  }

  if (auditSec) {
    auditSec.style.display = REPORT_MANAGEMENT_ROLES.includes(role) ? 'block' : 'none';
  }

  // Appointment/slot dashboard is available to closers and management.
  const appointmentsBtn = document.getElementById('nav-appointments-btn');
  if (appointmentsBtn) {
    const canViewSlots = role === 'closer' || REPORT_MANAGEMENT_ROLES.includes(role);
    appointmentsBtn.classList.toggle('hidden', !canViewSlots);
    appointmentsBtn.style.display = canViewSlots ? '' : 'none';
  }

  checkReportingAccess(user);
}

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

async function fetchAIInsights() {
  try {
    const res = await fetch('/api/ai/insights', { headers: getAuthHeaders() });
    const data = await res.json();
    if (res.ok) {
      renderAIWidget(data);
    }
  } catch (err) {
    console.error('AI Insights Error:', err);
  }
}

function renderAIWidget(data) {
  let aiContainer = document.getElementById('ai-insights-widget');
  const dashboardSection = document.getElementById('dashboard-section');

  if (!aiContainer && dashboardSection) {
    aiContainer = document.createElement('div');
    aiContainer.id = 'ai-insights-widget';
    aiContainer.className = 'card-glass border-purple-500/30 p-4 rounded-xl mb-6 shadow-xl animate-fade-in';
    dashboardSection.insertBefore(aiContainer, dashboardSection.firstChild);
  }

  if (aiContainer) {
    aiContainer.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-bold text-purple-500 uppercase tracking-widest">🤖 AI Pipeline Assistant</span>
      </div>
      <p class="text-sm font-semibold">${data.scoreSummary}</p>
      <p class="text-xs opacity-80 mt-1">${data.recommendation}</p>
    `;
  }
}

async function fetchAnalytics() {
  try {
    const res = await fetch('/api/analytics', { headers: getAuthHeaders() });
    const stats = await res.json();
    if (res.ok) {
      latestAnalytics = stats;
      renderKPICards(stats);
      updateCRMKPIs(stats);
      renderFronterAnalytics(stats);
      renderChaseOverdueBanner();
      v4Update();
    }
  } catch (err) {
    console.error('Error fetching analytics:', err);
  }
}

function renderKPICards(stats) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = (user.role || '').toLowerCase();
  const isFronter = role === 'fronter' || role === 'fronting';
  let kpiContainer = document.getElementById('kpi-cards-container');
  if (isFronter) {
    if (kpiContainer) kpiContainer.classList.add('hidden');
    return;
  }
  if (kpiContainer) kpiContainer.classList.remove('hidden');

  if (!kpiContainer) {
    const dashboardSection = document.getElementById('dashboard-section');
    if (!dashboardSection) return;

    kpiContainer = document.createElement('div');
    kpiContainer.id = 'kpi-cards-container';
    kpiContainer.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6';
    dashboardSection.insertBefore(kpiContainer, dashboardSection.firstChild);
  }

  kpiContainer.innerHTML = `
    <div class="card-glass p-4 rounded-xl shadow-md transition-all hover:scale-[1.02]">
      <p class="text-xs font-semibold uppercase tracking-wider opacity-75">Total Pipeline Leads</p>
      <h3 class="text-2xl font-bold mt-1">${stats.totalLeads}</h3>
    </div>
    <div class="card-glass p-4 rounded-xl shadow-md transition-all hover:scale-[1.02]">
      <p class="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Deals Closed / Won</p>
      <h3 class="text-2xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">${stats.closedDeals}</h3>
    </div>
    <div class="card-glass p-4 rounded-xl shadow-md transition-all hover:scale-[1.02]">
      <p class="text-xs font-semibold text-amber-500 uppercase tracking-wider">Conversion Rate</p>
      <h3 class="text-2xl font-bold text-amber-600 dark:text-amber-300 mt-1">${stats.conversionRate}%</h3>
    </div>
    <div class="card-glass p-4 rounded-xl shadow-md transition-all hover:scale-[1.02]">
      <p class="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Claimable Leads Pool</p>
      <h3 class="text-2xl font-bold text-indigo-600 dark:text-indigo-300 mt-1">${stats.unassignedLeads}</h3>
    </div>
  `;
}

function renderFronterAnalytics(stats) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = (user.role || '').toLowerCase();
  const section = document.getElementById('fronter-summary');
  if (!section) return;
  const isFronter = role === 'fronter' || role === 'fronting';
  section.classList.toggle('hidden', !isFronter);
  if (!isFronter) return;

  const total = document.getElementById('fronter-total-leads');
  const completed = document.getElementById('fronter-completed-leads');
  const rate = document.getElementById('fronter-completion-rate');
  if (total) total.textContent = stats.totalLeads ?? 0;
  if (completed) completed.textContent = stats.completedLeads ?? 0;
  if (rate) rate.textContent = `${stats.completionRate ?? 0}%`;

  let breakdown = document.getElementById('fronter-disposition-breakdown');
  if (!breakdown) {
    breakdown = document.createElement('div');
    breakdown.id = 'fronter-disposition-breakdown';
    breakdown.className = 'sm:col-span-3 mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2';
    section.appendChild(breakdown);
  }
  const items = (stats.closerDispositionBreakdown || []).slice(0, 6);
  breakdown.innerHTML = items.length
    ? items.map(item => `<div class="px-3 py-2 rounded-xl border border-[var(--border-main)] bg-[var(--bg-input)]">
        <div class="text-[9px] uppercase tracking-wider opacity-60 truncate">${item.status}</div>
        <div class="text-sm font-extrabold mt-0.5">${item.count}</div>
      </div>`).join('')
    : `<div class="col-span-full text-[10px] opacity-50 px-2">Closer dispositions will appear here after your leads are worked.</div>`;
}

function renderChaseOverdueBanner() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = (user.role || '').toLowerCase();
  const banner = document.getElementById('chase-overdue-banner');
  if (!banner) return;

  const overdueFromAnalytics = Number(latestAnalytics?.chaseOverdue || 0);
  const overdueLocal = (globalLeads || []).filter(l =>
    ['Customer Form Completed', 'Customer Form Sent'].includes(l.status) &&
    l.follow_up_at && new Date(l.follow_up_at).getTime() < Date.now() &&
    Number(l.chase_assigned_to) === Number(user.id)
  ).length;
  const overdueCount = Math.max(overdueFromAnalytics, overdueLocal);
  const show = role === 'chase' && overdueCount > 0;
  banner.classList.toggle('hidden', !show);
  const text = document.getElementById('chase-overdue-text');
  if (text && show) {
    text.textContent = `${overdueCount} chase task(s) are overdue. Complete the required disposition to clear the red SLA alert.`;
  }
}

async function fetchChaseAIReport() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = (user.role || '').toLowerCase();
  if (role !== 'chase' && !REPORT_MANAGEMENT_ROLES.includes(role)) return;

  try {
    const res = await fetch('/api/ai/chase-report', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) return;

    const panel = document.getElementById('chase-ai-report');
    if (!panel) return;
    panel.classList.remove('hidden');

    const summary = document.getElementById('chase-ai-summary');
    if (summary) {
      summary.textContent = `${data.scope} • Generated ${new Date(data.generated_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
    }

    const kpis = data.kpis || {};
    const kpiItems = [
      ['Active', kpis.active, 'blue'],
      ['Awaiting Send', kpis.awaitingSend, 'amber'],
      ['Awaiting Return', kpis.awaitingReturn, 'indigo'],
      ['Received', kpis.formReceived, 'emerald'],
      ['Overdue', kpis.overdue, 'rose'],
      ['24H SLA', `${kpis.sendSlaRate}%`, 'purple'],
      ['Avg Send', `${kpis.avgHoursToSend}h`, 'blue'],
      ['Avg Return', `${kpis.avgDaysToReturn}d`, 'emerald'],
      ['Risk Rate', `${kpis.overdueRate ?? 0}%`, 'rose'],
      ['SLA Health', `${kpis.slaHealth || 'Healthy'}`, 'purple'],
      ['Return Rate', `${kpis.returnRate ?? 0}%`, 'emerald'],
      ['Workload', `${kpis.workloadScore ?? 0}/100`, 'blue'],
      ['Due Next 7d', `${kpis.expectedReturnsNext7d ?? 0}`, 'amber']
    ];
    const kpiBox = document.getElementById('chase-ai-kpis');
    if (kpiBox) {
      kpiBox.innerHTML = kpiItems.map(([label, value, color]) => `
        <div class="p-3 rounded-xl border border-[var(--border-main)] bg-${color}-500/5">
          <div class="text-[10px] uppercase tracking-wider opacity-65">${label}</div>
          <div class="text-xl font-extrabold mt-1">${value ?? 0}</div>
        </div>
      `).join('');
    }

    const rec = document.getElementById('chase-ai-recommendations');
    if (rec) {
      rec.innerHTML = (data.recommendations || []).map((item, i) => `
        <div class="p-3 rounded-xl border border-[var(--border-main)] text-xs">
          <span class="font-bold text-purple-500">AI ${i + 1}</span>
          <span class="ml-2">${item}</span>
        </div>
      `).join('');
    }

    const risk = document.getElementById('chase-ai-risk-list');
    if (risk) {
      risk.innerHTML = data.riskLeads?.length
        ? data.riskLeads.map(l => `
          <div class="p-3 rounded-xl border border-rose-500/25 bg-rose-500/5 text-xs">
            <div class="font-bold">${l.customer_name} <span class="text-rose-500">+${l.overdue_hours}h overdue</span></div>
            <div class="opacity-70 mt-1">${l.status} • ${l.chase_agent_name}</div>
          </div>
        `).join('')
        : `<div class="text-xs opacity-60 p-3 rounded-xl border border-[var(--border-main)]">No high-risk overdue leads detected.</div>`;
    }

    const agents = document.getElementById('chase-ai-agents');
    if (agents) {
      agents.innerHTML = `
        <table>
          <thead><tr>
            <th>Chase Agent</th><th>Assigned</th><th>Sent</th><th>Received</th><th>Send %</th><th>Return %</th><th>Overdue</th>
          </tr></thead>
          <tbody>
            ${(data.agentPerformance || []).map(a => `
              <tr>
                <td>${a.name}</td><td>${a.assigned}</td><td>${a.sent}</td><td>${a.received}</td>
                <td>${a.sendRate}%</td><td class="font-bold">${a.returnRate}%</td>
                <td class="${a.overdue ? 'text-rose-500 font-bold' : 'text-emerald-500'}">${a.overdue}</td>
              </tr>
            `).join('') || `<tr><td colspan="7" class="p-4 text-center opacity-60">No chase performance data yet.</td></tr>`}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error('Chase AI report error:', err);
  }
}

function injectFilterAndExportUI() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const parentContainer = searchInput.parentElement;
  if (!parentContainer || document.getElementById('filter-disposition')) return;

  parentContainer.className = "flex flex-wrap gap-2 items-center";

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();
  const isAdmin = REPORT_MANAGEMENT_ROLES.includes(userRole);

  const filterDiv = document.createElement('div');
  filterDiv.className = "flex flex-wrap gap-2 items-center";
  filterDiv.innerHTML = `
    <select id="filter-disposition" onchange="fetchLeads(1)" class="text-xs rounded-lg p-2 focus:outline-none transition-all">
      <option value="all">All Dispositions</option>
      ${DISPOSITIONS.map(d => `<option value="${d}">${d}</option>`).join('')}
    </select>
    ${isAdmin ? `
      <select id="filter-agent" onchange="fetchLeads(1)" class="text-xs rounded-lg p-2 focus:outline-none transition-all">
        <option value="">All Agents</option>
        <option value="unassigned">Unassigned Only</option>
      </select>
    ` : ''}
    <button onclick="exportToCSV()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-2 rounded-lg transition-all shadow-sm">
      Export CSV
    </button>
  `;

  parentContainer.appendChild(filterDiv);
  populateAgentFilter();
  populateLeadAssignedDropdown();
}

function setupSearchListener() {
  const searchInput = document.getElementById('search-input');
  if (searchInput && !searchInput.dataset.listenerAdded) {
    searchInput.dataset.listenerAdded = 'true';
    searchInput.addEventListener('input', () => {
      fetchLeads(1);
    });
  }
}

function populateAgentFilter() {
  const agentSelect = document.getElementById('filter-agent');
  if (!agentSelect || globalUsers.length === 0) return;

  const currentVal = agentSelect.value;
  agentSelect.innerHTML = `
    <option value="">All Agents</option>
    <option value="unassigned">Unassigned Only</option>
    ${globalUsers.map(u => `<option value="${u.id}">${u.full_name || u.name}</option>`).join('')}
  `;
  agentSelect.value = currentVal;
}

function populateLeadAssignedDropdown() {
  const select = document.getElementById('lead-assigned-to');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">Select Closer...</option>';
  globalUsers
    .filter(u => (u.role || '').toLowerCase().trim() === 'closer')
    .forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.full_name || u.name || u.email;
      select.appendChild(opt);
    });
  select.value = currentVal;
}

async function fetchUsers() {
  try {
    const res = await fetch('/api/users', { headers: getAuthHeaders() });
    const users = await res.json();
    if (res.ok) {
      globalUsers = users;
      renderAgentManagementTable(users);
      populateAgentFilter();
      populateLeadAssignedDropdown();
      renderLeads();
    }
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

function renderAgentManagementTable(users) {
  const tbody = document.getElementById('agent-management-table-body');
  if (!tbody) return;
  
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-xs opacity-60">No system agents found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr class="transition-colors">
      <td class="p-3">#${u.id}</td>
      <td class="p-3 font-semibold">${u.full_name || u.name || 'N/A'}</td>
      <td class="p-3 opacity-80">${u.email}</td>
      <td class="p-3">
        <select onchange="updateUserRole(${u.id}, this.value)" class="p-1.5 rounded-lg text-xs focus:outline-none">
          <option value="fronter" ${u.role === 'fronter' ? 'selected' : ''}>Fronting Agent</option>
          <option value="closer" ${u.role === 'closer' ? 'selected' : ''}>Closing Agent</option>
          <option value="qa" ${u.role === 'qa' ? 'selected' : ''}>QA Agent</option>
          <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="superadmin" ${u.role === 'superadmin' || u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
        </select>
      </td>
      <td class="p-3">
        <div class="flex items-center gap-2">
          <input type="number" value="${u.daily_limit || 50}" min="1" max="1000" id="limit-${u.id}" class="w-20 p-1 text-xs text-center">
          <button onclick="updateUserLimit(${u.id})" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-2.5 py-1 rounded text-xs transition-all">Set</button>
        </div>
      </td>
      <td class="p-3">
        <button onclick="openChangePasswordModal(${u.id}, '${u.full_name || u.name || u.email}')" class="text-indigo-500 hover:underline text-xs font-semibold transition-colors">Change Password</button>
      </td>
      <td class="p-3">
        <button onclick="deleteUser(${u.id})" class="text-rose-500 hover:underline text-xs font-semibold transition-colors">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function handleCreateUser(e) {
  e.preventDefault();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();

  if (userRole !== 'superadmin' && userRole !== 'super_admin' && userRole !== 'admin') {
    alert('Access Denied: Only Admin or Super Admin can create new users.');
    return;
  }

  const full_name = document.getElementById('new-name').value;
  const email = document.getElementById('new-email').value;
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const daily_limit = document.getElementById('new-limit')?.value || 50;

  try {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ full_name, email, password, role, daily_limit })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user');

    e.target.reset();
    fetchUsers();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
    alert('Agent account successfully created.');
  } catch (err) {
    alert(err.message);
  }
}

async function updateUserRole(userId, newRole) {
  try {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role: newRole })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update user role');
    fetchUsers();
  } catch (err) {
    alert(err.message);
    fetchUsers();
  }
}

async function updateUserLimit(userId) {
  const limitInput = document.getElementById(`limit-${userId}`);
  if (!limitInput) return;
  const daily_limit = parseInt(limitInput.value, 10);

  try {
    const res = await fetch(`/api/users/${userId}/limit`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ daily_limit })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update user limit');
    alert('User limit updated successfully.');
  } catch (err) {
    alert(err.message);
  }
}

function openChangePasswordModal(userId, userName) {
  let modal = document.getElementById('password-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'password-modal';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 hidden animate-fade-in p-4';
    modal.innerHTML = `
      <div class="card-glass p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-scale-up">
        <h2 class="text-lg font-bold mb-2">Change User Password</h2>
        <p class="text-xs opacity-75 mb-4" id="modal-target-agent">Target: </p>
        <form onsubmit="submitChangePassword(event)" class="space-y-3">
          <input type="hidden" id="pass-target-id">
          <div>
            <label class="block text-xs opacity-75 mb-1">New Password</label>
            <input type="password" id="modal-new-password" placeholder="••••••••" required class="w-full p-2.5 text-xs">
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" onclick="closeChangePasswordModal()" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs transition-all">Cancel</button>
            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all">Update Password</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('pass-target-id').value = userId;
  document.getElementById('modal-target-agent').innerText = `Target Agent: ${userName}`;
  document.getElementById('modal-new-password').value = '';
  const rescheduleSection = bookingDayInput?.closest('.grid');
  if (rescheduleSection) rescheduleSection.classList.toggle('hidden', isFronter);

  let lockNotice = document.getElementById('fronter-lock-notice');
  if (isFronter && modal) {
    if (!lockNotice) {
      lockNotice = document.createElement('div');
      lockNotice.id = 'fronter-lock-notice';
      lockNotice.className = 'p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 text-xs font-semibold';
      modal.querySelector('#lead-detail-content')?.prepend(lockNotice);
    }
    lockNotice.textContent = '🔒 Submitted leads are locked. You can view the lead and closer outcome, but you cannot edit it.';
    lockNotice.classList.remove('hidden');
  } else if (lockNotice) {
    lockNotice.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeChangePasswordModal() {
  const modal = document.getElementById('password-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitChangePassword(e) {
  e.preventDefault();
  const userId = document.getElementById('pass-target-id').value;
  const newPassword = document.getElementById('modal-new-password').value;

  try {
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ password: newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');

    closeChangePasswordModal();
    alert('Password updated successfully.');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this agent account? This action cannot be undone.')) return;

  try {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete user');

    fetchUsers();
    alert('User account deleted.');
  } catch (err) {
    alert(err.message);
  }
}

async function fetchLeads(page = 1) {
  try {
    currentLeadPage = page;
    const disp = document.getElementById('filter-disposition')?.value || 'all';
    const agent = document.getElementById('filter-agent')?.value || '';
    const search = document.getElementById('search-input')?.value || '';

    let queryParams = new URLSearchParams();
    queryParams.append('page', currentLeadPage);
    queryParams.append('limit', leadsPerPage);
    if (disp !== 'all') queryParams.append('disposition', disp);
    if (agent) queryParams.append('assigned', agent);
    if (search) queryParams.append('search', search);

    const res = await fetch(`/api/customers?${queryParams.toString()}`, { headers: getAuthHeaders() });
    const result = await res.json();
    if (res.ok) {
      globalLeads = result.data;
      totalLeadPages = result.totalPages;
      renderLeads();
      renderPaginationControls(result.total, result.page, result.totalPages);
    }
  } catch (err) {
    console.error('Error fetching leads:', err);
  }
}

async function fetchUnassignedLeads() {
  try {
    const res = await fetch('/api/customers/unassigned', { headers: getAuthHeaders() });
    const leads = await res.json();
    if (res.ok) {
      globalUnassignedLeads = leads;
      renderUnassignedPool();
    }
  } catch (err) {
    console.error('Error fetching unassigned pool:', err);
  }
}

async function fetchReminders() {
  try {
    const res = await fetch('/api/reminders/due', { headers: getAuthHeaders() });
    const reminders = await res.json();
    if (res.ok) {
      globalReminders = reminders;
      renderRemindersWidget(reminders);
    }
  } catch (err) {
    console.error('Error fetching reminders:', err);
  }
}

function formatCountdown(target) {
  if (!target) return '';
  const diff = new Date(target).getTime() - Date.now();
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const secs = Math.floor((abs % 60000) / 1000);
  const value = days > 0
    ? `${days}d ${hours}h`
    : hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`;

  return overdue
    ? `<span class="sla-overdue inline-flex items-center gap-1 bg-rose-500/15 text-rose-500 px-2 py-1 rounded-lg text-[10px] font-extrabold">🚨 OVERDUE • ${value}</span>`
    : `<span class="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-1 rounded-lg text-[10px] font-semibold">⏱ ${value}</span>`;
}

function renderLeadTimer(l) {
  if (l.status === 'Customer Form Completed' && l.chase_due_at) {
    return `<div class="mt-1">${formatCountdown(l.chase_due_at)}<div class="text-[9px] opacity-55 mt-0.5">24-hour physical-form SLA</div></div>`;
  }
  if (l.status === 'Customer Form Sent' && l.chase_return_due_at) {
    return `<div class="mt-1">${formatCountdown(l.chase_return_due_at)}<div class="text-[9px] opacity-55 mt-0.5">7-day customer return SLA</div></div>`;
  }
  return '';
}

function renderLeads() {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const normalizedRole = (user.role || '').toLowerCase().trim();
  const isFronterRole = normalizedRole === 'fronter' || normalizedRole === 'fronting';
  const isCloser = normalizedRole === 'closer';
  const isChase = normalizedRole === 'chase';
  const userId = user.id;

  const canAssignCloser = normalizedRole === 'admin' || normalizedRole === 'superadmin' || normalizedRole === 'super_admin';
  const canDelete = canAssignCloser;
  const isQA = normalizedRole === 'qa';

  const tableHead = tbody.closest('table')?.querySelector('thead tr');
  if (tableHead) {
    tableHead.innerHTML = `
      <th>Customer</th>
      <th>Phone</th>
      <th>Closer / Chase</th>
      <th>Disposition</th>
      <th>SLA Timer</th>
      <th>QA</th>
      <th>Actions</th>
    `;
  }

  let leads = [...(globalLeads || [])];
  if (isFronterRole) leads = leads.filter(l => Number(l.assigned_to) === Number(userId));

  if (leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center opacity-60 text-xs">No leads found matching the current queue.</td></tr>`;
    return;
  }

  const ownCloser = isCloser ? leads.filter(l => l.is_own_closer_lead) : [];
  const otherCloser = isCloser ? leads.filter(l => !l.is_own_closer_lead) : [];
  const groups = isCloser
    ? [
        ['MY CLOSER LEADS', ownCloser],
        ['OTHER CLOSER LEADS · VIEW ONLY', otherCloser]
      ]
    : [['PIPELINE QUEUE', leads]];

  let htmlRows = '';

  groups.forEach(([title, group]) => {
    if (!group.length) return;
    if (isCloser) {
      htmlRows += `<tr class="bg-blue-500/5">
        <td colspan="7" class="p-3 text-left text-[10px] font-extrabold tracking-[0.18em] text-blue-500">${title} <span class="opacity-60">(${group.length})</span></td>
      </tr>`;
    }

    htmlRows += group.map(l => {
      const isMasked = isFronterRole;
      const displayPhone = isMasked && l.phone_number
        ? l.phone_number.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : (l.phone_number || 'N/A');

      const bookedDisplay = l.booking_time
        ? `<div class="text-[9px] opacity-55 mt-1">${l.booking_day || ''} ${l.booking_time}</div>`
        : '';

      let qaBadge = `<span class="text-[10px] opacity-50">Not Graded</span>`;
      if (l.qa_status === 'Pass') qaBadge = `<span class="bg-emerald-500/15 text-emerald-500 px-2 py-1 rounded-lg text-[10px] font-bold">PASS ${l.qa_score ?? ''}</span>`;
      if (l.qa_status === 'Fail') qaBadge = `<span class="bg-rose-500/15 text-rose-500 px-2 py-1 rounded-lg text-[10px] font-bold">FAIL ${l.qa_score ?? ''}</span>`;

      let dispositionControl = `<span class="text-xs font-semibold">${l.status || 'Pending'}</span>`;

      if (isCloser && l.is_own_closer_lead) {
        dispositionControl = `<select onchange="updateLeadStatus(${l.id}, this.value)" class="p-2 rounded-lg text-xs w-full">
          ${CLOSER_DISPOSITIONS.map(d => `<option value="${d}" ${l.status === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>`;
      } else if (isChase && l.is_own_chase_lead) {
        const chaseOptions = l.status === 'Customer Form Completed'
          ? ['Customer Form Sent']
          : ['Customer Form Received'];
        dispositionControl = `<select onchange="updateLeadStatus(${l.id}, this.value)" class="p-2 rounded-lg text-xs w-full">
          <option value="">Update disposition...</option>
          ${chaseOptions.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>`;
      } else if (isFronterRole) {
        dispositionControl = `<span class="text-xs font-semibold text-amber-500">${l.status || 'Pending'}</span>`;
      }

      let actionButtons = `
        <button onclick="openLeadDetailModal(${l.id})" class="text-emerald-500 hover:underline text-xs font-semibold">Details</button>
      `;

      if (isChase && !l.chase_assigned_to && l.status === 'Customer Form Completed') {
        actionButtons += `<button onclick="claimChaseLead(${l.id})" class="text-purple-500 hover:underline text-xs font-semibold">Claim</button>`;
      }

      if (!isFronterRole && !isChase) {
        actionButtons += `<button onclick="openEditModal(${l.id})" class="text-blue-500 hover:underline text-xs font-semibold">Edit</button>`;
      }
      if (isQA || ['admin', 'superadmin', 'super_admin', 'manager'].includes(normalizedRole)) {
        actionButtons += `<button onclick="openQAModal(${l.id})" class="text-purple-400 hover:underline text-xs font-semibold">QA</button>`;
      }
      if (canDelete) {
        actionButtons += `<button onclick="deleteLead(${l.id})" class="text-rose-500 hover:underline text-xs font-semibold">Delete</button>`;
      }

      const closerCell = canAssignCloser
        ? `<select onchange="assignLead(${l.id}, this.value)" class="p-2 rounded-lg text-xs w-full">
            <option value="">Select closer</option>
            ${globalUsers.filter(u => (u.role || '').toLowerCase() === 'closer').map(u =>
              `<option value="${u.id}" ${Number(l.closer_id) === Number(u.id) ? 'selected' : ''}>${u.full_name || u.email}</option>`
            ).join('')}
          </select>
          <div class="text-[9px] opacity-55 mt-1">Chase: ${l.chase_agent_name || 'Queue / Unassigned'}</div>`
        : `<div class="text-xs font-semibold">${l.closer_name || l.closer_id || 'Unassigned'}</div>
           <div class="text-[9px] opacity-55 mt-1">Chase: ${l.chase_agent_name || 'Queue / Unassigned'}</div>`;

      const timer = renderLeadTimer(l);

      return `
        <tr class="transition-colors ${l.follow_up_at && new Date(l.follow_up_at).getTime() < Date.now() ? 'bg-rose-500/[0.035]' : ''}">
          <td class="p-3 text-left">
            <div onclick="openLeadDetailModal(${l.id})" class="font-semibold text-blue-500 hover:underline cursor-pointer">${l.customer_name}</div>
            <div class="text-[9px] mt-1 opacity-55">ID #${l.id} · DOB ${l.date_of_birth ? l.date_of_birth.split('T')[0] : 'N/A'}</div>
            ${bookedDisplay}
          </td>
          <td class="p-3 font-mono text-xs">${displayPhone}</td>
          <td class="p-3 text-left">${closerCell}</td>
          <td class="p-3">${dispositionControl}</td>
          <td class="p-3 text-left">${timer || '<span class="text-[10px] opacity-40">No active SLA</span>'}</td>
          <td class="p-3">${qaBadge}${l.qa_remarks ? `<div class="text-[9px] text-purple-400 mt-1">${l.qa_remarks}</div>` : ''}</td>
          <td class="p-3 flex gap-2 flex-wrap justify-center">${actionButtons}</td>
        </tr>
      `;
    }).join('');
  });

  tbody.innerHTML = htmlRows;
  renderChaseOverdueBanner();
}

function openLeadDetailModal(id) {
  const lead = globalLeads.find(l => l.id == id);
  if (!lead) return alert("Lead not found.");

  currentUserLeadId = lead.id;

  const modal = document.getElementById('lead-detail-modal');
  if (!modal) {
    console.error("Critical: #lead-detail-modal container element not found in DOM.");
    return;
  }

  const nameEl = document.getElementById('modal-customer-name');
  const metaEl = document.getElementById('modal-customer-meta');
  if (nameEl) nameEl.textContent = lead.customer_name;
  if (metaEl) metaEl.textContent = `Phone: ${lead.phone_number || 'N/A'} | DOB: ${lead.date_of_birth ? lead.date_of_birth.split('T')[0] : 'N/A'}`;

  renderModalNotesHistory(lead.notes);

  const currentRole = (JSON.parse(localStorage.getItem('user') || '{}').role || '').toLowerCase();
  const isFronter = currentRole === 'fronter' || currentRole === 'fronting';
  const noteBox = document.getElementById('modal-new-note');
  const noteButton = noteBox?.closest('div')?.querySelector('button');
  if (noteBox) {
    noteBox.value = '';
    noteBox.disabled = isFronter;
    noteBox.placeholder = isFronter ? 'Lead is locked after submission.' : 'Add a new note...';
  }
  if (noteButton) noteButton.classList.toggle('hidden', isFronter);

  const bookingDayInput = document.getElementById('modal-booking-day');
  if (bookingDayInput) bookingDayInput.value = lead.booking_day || '';

  const bookingTimeInput = document.getElementById('modal-booking-time');
  if (bookingTimeInput) bookingTimeInput.value = lead.booking_time || '';

  modal.classList.remove('hidden');
}

let currentUserLeadId = null;

function renderModalNotesHistory(notesString) {
  const container = document.getElementById('modal-notes-container');
  if (!container) return;

  if (!notesString || notesString.trim() === '') {
    container.innerHTML = `<span class="opacity-50 italic">No notes recorded yet.</span>`;
    return;
  }

  const lines = notesString.split('\n');
  container.innerHTML = lines.map(line => `<div class="py-1 border-b border-[var(--border-main)] last:border-0">${line}</div>`).join('');
}

function closeLeadDetailModal() {
  const modal = document.getElementById('lead-detail-modal');
  if (modal) modal.classList.add('hidden');
  currentUserLeadId = null;
}

async function submitModalNote() {
  if (!currentUserLeadId) return alert("No active lead selected.");
  const noteInput = document.getElementById('modal-new-note');
  if (!noteInput || !noteInput.value.trim()) return alert("Please enter a note before submitting.");

  const lead = globalLeads.find(l => l.id == currentUserLeadId);
  if (!lead) return alert("Lead context reference missing.");

  const timestamp = new Date().toLocaleString();
  const currentUserObj = JSON.parse(localStorage.getItem('user') || '{}');
  const author = currentUserObj.full_name || currentUserObj.name || currentUserObj.email || 'User';
  const newEntry = `[${timestamp} - ${author}]: ${noteInput.value.trim()}`;
  
  const updatedNotes = lead.notes ? `${lead.notes}\n${newEntry}` : newEntry;

  try {
    const res = await fetch(`/api/customers/${currentUserLeadId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        customer_name: lead.customer_name, 
        phone_number: lead.phone_number, 
        date_of_birth: lead.date_of_birth, 
        booking_time: lead.booking_time, 
        notes: updatedNotes 
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add note');

    lead.notes = updatedNotes;
    renderModalNotesHistory(updatedNotes);
    noteInput.value = '';
    fetchLeads(currentLeadPage);
    fetchAnalytics();
  } catch (err) {
    alert(err.message);
  }
}

async function submitModalReschedule() {
  if (!currentUserLeadId) return alert("No active lead selected.");
  const bookingDayInput = document.getElementById('modal-booking-day');
  const bookingInput = document.getElementById('modal-booking-time');
  if (!bookingDayInput || !bookingDayInput.value || !bookingInput || !bookingInput.value) {
    return alert("Please select a valid booking day and time.");
  }

  const lead = globalLeads.find(l => l.id == currentUserLeadId);
  if (!lead) return alert("Lead context reference missing.");

  const booking_day = bookingDayInput.value;
  const booking_time = bookingInput.value;

  try {
    const res = await fetch(`/api/customers/${currentUserLeadId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        customer_name: lead.customer_name, 
        phone_number: lead.phone_number, 
        date_of_birth: lead.date_of_birth,
        booking_day,
        booking_time,
        closer_id: lead.closer_id || lead.appointment_closer_id || undefined,
        notes: lead.notes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update schedule');

    lead.booking_day = booking_day;
    lead.booking_time = booking_time;
    fetchLeads(currentLeadPage);
    fetchReminders();
    alert('Booking time and schedule successfully updated.');
  } catch (err) {
    alert(err.message);
  }
}

async function saveLeadChanges() {
  if (!currentUserLeadId) {
    closeLeadDetailModal();
    return;
  }
  
  const noteInput = document.getElementById('modal-new-note');
  if (noteInput && noteInput.value.trim()) {
    await submitModalNote();
  }

  const bookingDayInput = document.getElementById('modal-booking-day');
  const bookingInput = document.getElementById('modal-booking-time');
  const lead = globalLeads.find(l => l.id == currentUserLeadId);
  const bookingChanged = lead && bookingDayInput && bookingInput &&
    bookingDayInput.value && bookingInput.value &&
    (bookingDayInput.value !== (lead.booking_day || '') || bookingInput.value !== (lead.booking_time || ''));

  if (bookingChanged) {
    await submitModalReschedule();
  }

  closeLeadDetailModal();
  fetchLeads(currentLeadPage);
  fetchAnalytics();
  fetchReminders();
}

function openQAModal(id) {
  const lead = globalLeads.find(l => l.id == id);
  if (!lead) return alert("Lead not found.");

  let modal = document.getElementById('qa-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qa-modal';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 hidden animate-fade-in p-4';
    modal.innerHTML = `
      <div class="card-glass p-6 rounded-2xl w-full max-w-md shadow-2xl animate-scale-up">
        <h2 class="text-lg font-bold mb-4 text-purple-400">QA Call Grading & Review</h2>
        <form onsubmit="submitQAReview(event)" class="space-y-3">
          <input type="hidden" id="qa-lead-id">
          <div>
            <label class="block text-xs opacity-75 mb-1">QA Score (0 - 100)</label>
            <input type="number" id="qa-score-input" min="0" max="100" required class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Pass / Fail Status</label>
            <select id="qa-status-input" required class="w-full p-2.5 text-xs rounded-lg">
              <option value="Pass">Pass</option>
              <option value="Fail">Fail</option>
            </select>
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">QA Remarks & Feedback</label>
            <textarea id="qa-remarks-input" rows="3" placeholder="Enter notes regarding call quality..." class="w-full p-2.5 text-xs"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" onclick="closeQAModal()" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs transition-all">Cancel</button>
            <button type="submit" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all">Save QA Review</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('qa-lead-id').value = lead.id;
  document.getElementById('qa-score-input').value = lead.qa_score ?? '';
  document.getElementById('qa-status-input').value = lead.qa_status || 'Pass';
  document.getElementById('qa-remarks-input').value = lead.qa_remarks || '';
  modal.classList.remove('hidden');
}

function closeQAModal() {
  const modal = document.getElementById('qa-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitQAReview(e) {
  e.preventDefault();
  const id = document.getElementById('qa-lead-id').value;
  const qa_score = parseInt(document.getElementById('qa-score-input').value, 10);
  const qa_status = document.getElementById('qa-status-input').value;
  const qa_remarks = document.getElementById('qa-remarks-input').value;

  try {
    const res = await fetch(`/api/customers/${id}/qa`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ qa_score, qa_status, qa_remarks })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit QA review');

    closeQAModal();
    fetchLeads(currentLeadPage);
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
    alert('QA review saved successfully.');
  } catch (err) {
    alert(err.message);
  }
}

function renderRemindersWidget(reminders) {
  let widget = document.getElementById('reminders-widget');
  const dashboardSection = document.getElementById('dashboard-section');
  if (!dashboardSection) return;

  const now = new Date();
  const dueReminders = reminders.filter(r => new Date(r.follow_up_at || r.booking_time) <= new Date(now.getTime() + 15 * 60000));

  if (dueReminders.length === 0) {
    if (widget) widget.remove();
    return;
  }

  if (!widget) {
    widget = document.createElement('div');
    widget.id = 'reminders-widget';
    widget.className = 'card-glass border-amber-500/40 p-4 rounded-xl mb-6 shadow-xl animate-fade-in';
    dashboardSection.insertBefore(widget, dashboardSection.firstChild);
  }

  widget.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-xs font-bold text-amber-500 uppercase tracking-wider">🔔 Active Follow-Up Reminders / To-Do Task List (${dueReminders.length})</h3>
    </div>
    <div class="space-y-2">
      ${dueReminders.map(r => {
        const timeDiff = Math.floor((new Date(r.follow_up_at || r.booking_time) - now) / 60000);
        const timeString = timeDiff < 0 ? `Overdue by ${Math.abs(timeDiff)} mins` : `Due in ${timeDiff} mins`;
        return `
          <div class="flex justify-between items-center bg-slate-100 dark:bg-slate-900/80 p-2.5 rounded-lg border border-amber-500/30 text-xs">
            <div>
              <span class="font-bold">${r.customer_name}</span>
              <span class="text-amber-500 ml-2 font-semibold">[${timeString}]</span>
            </div>
            <button onclick="openEditModal(${r.id})" class="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg font-semibold transition-all">
              View Lead
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPaginationControls(total, page, totalPages) {
  let paginationContainer = document.getElementById('pagination-container');
  const tableWrapper = document.getElementById('leads-table-body')?.closest('.overflow-x-auto') || document.getElementById('leads-table-body')?.parentElement;
  
  if (!tableWrapper) return;

  if (!paginationContainer) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'pagination-container';
    paginationContainer.className = 'flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs opacity-75';
    tableWrapper.parentNode.appendChild(paginationContainer);
  }

  const startRange = total === 0 ? 0 : (page - 1) * leadsPerPage + 1;
  const endRange = Math.min(page * leadsPerPage, total);

  paginationContainer.innerHTML = `
    <div>
      Showing <span class="font-semibold">${startRange}</span> to <span class="font-semibold">${endRange}</span> of <span class="font-semibold">${total}</span> leads
    </div>
    <div class="flex items-center gap-1">
      <button onclick="fetchLeads(${page - 1})" ${page <= 1 ? 'disabled class="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg"' : 'class="hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-all"'}>
        Previous
      </button>
      <span class="px-3 py-1.5 rounded-lg font-semibold">
        Page ${page} of ${totalPages || 1}
      </span>
      <button onclick="fetchLeads(${page + 1})" ${page >= totalPages ? 'disabled class="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg"' : 'class="hover:bg-slate-200 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-all"'}>
        Next
      </button>
    </div>
  `;
}

function exportToCSV() {
  if (globalLeads.length === 0) {
    alert('No lead data available to export.');
    return;
  }

  const headers = ['ID', 'Customer Name', 'Phone', 'DOB', 'Booking Time', 'Status', 'QA Score', 'QA Status', 'QA Remarks', 'Assigned Agent', 'Follow-up At', 'Notes'];
  const rows = globalLeads.map(l => [
    l.id,
    `"${(l.customer_name || '').replace(/"/g, '""')}"`,
    `"${l.phone_number || ''}"`,
    l.date_of_birth ? l.date_of_birth.split('T')[0] : '',
    l.booking_time ? l.booking_time.replace('T', ' ') : '',
    `"${l.status || ''}"`,
    l.qa_score ?? '',
    `"${l.qa_status || ''}"`,
    `"${(l.qa_remarks || '').replace(/"/g, '""')}"`,
    `"${l.assigned_to_name || l.assigned_to || 'Unassigned'}"`,
    l.follow_up_at ? l.follow_up_at.replace('T', ' ') : '',
    `"${(l.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `crm_leads_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderUnassignedPool() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();

  const isAgent = ['chase', 'closer', 'agent', 'chase agent', 'closer agent', 'fronter'].includes(userRole);
  let poolSection = document.getElementById('unassigned-pool-section');

  if (!isAgent) {
    if (poolSection) poolSection.style.display = 'none';
    return;
  }

  if (!poolSection) {
    const queueCard = document.getElementById('leads-table-body')?.closest('.card-glass') || document.querySelector('#dashboard-section > div');
    if (!queueCard) return;

    poolSection = document.createElement('div');
    poolSection.id = 'unassigned-pool-section';
    poolSection.className = 'card-glass p-6 rounded-xl mt-6 shadow-xl animate-fade-in';
    poolSection.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div>
          <h2 class="text-lg font-bold">Unassigned Lead Pool</h2>
          <p class="text-xs opacity-75">Claim unassigned leads to move them directly into your personal pipeline.</p>
        </div>
        <button onclick="fetchUnassignedLeads()" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs transition-all">Refresh Pool</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr>
              <th class="p-3">Customer Name</th>
              <th class="p-3">Phone</th>
              <th class="p-3">Notes</th>
              <th class="p-3">Status</th>
              <th class="p-3">Action</th>
            </tr>
          </thead>
          <tbody id="unassigned-table-body" class="divide-y divide-slate-200 dark:divide-slate-800"></tbody>
        </table>
      </div>
    `;
    queueCard.parentNode.insertBefore(poolSection, queueCard.nextSibling);
  }

  poolSection.style.display = 'block';
  const tbody = document.getElementById('unassigned-table-body');
  if (!tbody) return;

  if (globalUnassignedLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-xs opacity-60">No unassigned leads available in pool right now.</td></tr>`;
    return;
  }

  tbody.innerHTML = globalUnassignedLeads.map(l => `
    <tr class="transition-colors">
      <td class="p-3 font-semibold">${l.customer_name}</td>
      <td class="p-3 font-mono">${l.phone_number || 'N/A'}</td>
      <td class="p-3 text-xs opacity-75 max-w-xs truncate">${l.notes || '-'}</td>
      <td class="p-3"><span class="bg-slate-200 dark:bg-slate-800 text-amber-500 px-2 py-0.5 rounded text-xs font-semibold">${l.status}</span></td>
      <td class="p-3">
        <button onclick="claimLead(${l.id})" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm">
          Claim Lead
        </button>
      </td>
    </tr>
  `).join('');
}

async function claimLead(id) {
  try {
    const res = await fetch(`/api/customers/${id}/claim`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to claim lead');

    fetchAnalytics();
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchReminders();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
  } catch (err) {
    alert(err.message);
  }
}

async function handleCreateLead(e) {
  e.preventDefault();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin';

  if (!isSuperAdmin && userRole !== 'fronter') {
    alert('Access Denied: Only Super Admin and Fronter roles can submit new leads.');
    return;
  }

  const customer_name = document.getElementById('lead-name').value;
  const phone_number = document.getElementById('lead-phone').value;
  const date_of_birth = document.getElementById('lead-dob').value;
  const assigned_to = document.getElementById('lead-assigned-to')?.value || null;
  const booking_day = document.getElementById('lead-booking-day')?.value || null;
  const booking_time = document.getElementById('lead-booking-time')?.value || null;
  const notes = document.getElementById('lead-notes').value;

  if (!assigned_to || !booking_day || !booking_time) {
    alert('Please select a closer, booking day and time slot.');
    return;
  }

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        customer_name, 
        phone_number, 
        date_of_birth, 
        assigned_to: assigned_to ? parseInt(assigned_to, 10) : null,
        closer_id: assigned_to ? parseInt(assigned_to, 10) : null,
        booking_day,
        booking_time,
        notes
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create lead');

    e.target.reset();
    fetchAnalytics();
    fetchLeads(1);
    fetchUnassignedLeads();
    fetchReminders();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
    // Keep the slot board synchronized immediately after a new fronted lead.
    if (document.getElementById('slot-dashboard-view') &&
        !document.getElementById('slot-dashboard-view').classList.contains('hidden')) {
      fetchSlotDashboardData(document.getElementById('slot-week-picker')?.value);
    }
    alert('Lead created and slot booked successfully.');
  } catch (err) {
    alert(err.message);
  }
}

function openEditModal(id) {
  const lead = globalLeads.find(l => l.id == id) || globalUnassignedLeads.find(l => l.id == id) || globalReminders.find(l => l.id == id);
  if (!lead) {
    alert("Lead details could not be loaded.");
    return;
  }

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase().trim();
  const isFronterRole = userRole === 'fronter' || userRole.includes('front');
  if (isFronterRole) {
    alert('Leads are locked after submission. Fronters cannot edit them.');
    return;
  }

  let modal = document.getElementById('edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-modal';
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 hidden animate-fade-in p-4';
    modal.innerHTML = `
      <div class="card-glass p-6 rounded-2xl w-full max-w-md shadow-2xl animate-scale-up">
        <h2 class="text-lg font-bold mb-4">Edit Lead & Follow-Up</h2>
        <form id="edit-lead-form" onsubmit="handleUpdateLead(event)" class="space-y-3">
          <input type="hidden" id="edit-lead-id">
          <div>
            <label class="block text-xs opacity-75 mb-1">Customer Name</label>
            <input type="text" id="edit-lead-name" required class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Phone Number</label>
            <input type="text" id="edit-lead-phone" class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Date of Birth</label>
            <input type="date" id="edit-lead-dob" class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Booking Time & Date</label>
            <input type="datetime-local" id="edit-lead-booking-time" class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Follow-Up Reminder Time</label>
            <input type="datetime-local" id="edit-lead-reminder" class="w-full p-2.5 text-xs">
          </div>
          <div>
            <label class="block text-xs opacity-75 mb-1">Notes</label>
            <textarea id="edit-lead-notes" rows="3" class="w-full p-2.5 text-xs"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" onclick="closeEditModal()" class="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs transition-all">Cancel</button>
            <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal.classList.remove('hidden');

  document.getElementById('edit-lead-id').value = lead.id;
  document.getElementById('edit-lead-name').value = lead.customer_name || '';

  const phoneInput = document.getElementById('edit-lead-phone');
  if (phoneInput) {
    if (isFronterRole && lead.phone_number) {
      phoneInput.value = lead.phone_number.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
      phoneInput.disabled = true;
    } else {
      phoneInput.value = lead.phone_number || '';
      phoneInput.disabled = false;
    }
  }

  const notesInput = document.getElementById('edit-lead-notes');
  if (notesInput) notesInput.value = lead.notes || '';

  const dobInput = document.getElementById('edit-lead-dob');
  if (dobInput) dobInput.value = lead.date_of_birth ? lead.date_of_birth.split('T')[0] : '';

  const bookingInput = document.getElementById('edit-lead-booking-time');
  if (bookingInput) {
    if (lead.booking_time) {
      const bdt = new Date(lead.booking_time);
      bdt.setMinutes(bdt.getMinutes() - bdt.getTimezoneOffset());
      bookingInput.value = bdt.toISOString().slice(0, 16);
    } else {
      bookingInput.value = '';
    }
  }

  const elReminder = document.getElementById('edit-lead-reminder');
  if (elReminder) {
    if (lead.follow_up_at) {
      const dt = new Date(lead.follow_up_at);
      dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
      elReminder.value = dt.toISOString().slice(0, 16);
    } else {
      elReminder.value = '';
    }
  }
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleUpdateLead(e) {
  e.preventDefault();

  const id = document.getElementById('edit-lead-id')?.value;
  const customer_name = document.getElementById('edit-lead-name')?.value;
  const phoneInput = document.getElementById('edit-lead-phone');
  const phone_number = phoneInput && !phoneInput.disabled ? phoneInput.value : undefined;
  const date_of_birth = document.getElementById('edit-lead-dob')?.value || null;
  const booking_time = document.getElementById('edit-lead-booking-time')?.value || null;
  const notes = document.getElementById('edit-lead-notes')?.value || '';
  const follow_up_at = document.getElementById('edit-lead-reminder')?.value || null;

  if (!id) {
    alert("Error: Lead ID missing.");
    return;
  }

  try {
    const payload = { customer_name, date_of_birth, booking_time, notes };
    if (phone_number !== undefined) payload.phone_number = phone_number;

    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update lead');

    await fetch(`/api/customers/${id}/reminder`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ follow_up_at })
    });

    closeEditModal();
    fetchAnalytics();
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchReminders();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
  } catch (err) {
    alert(err.message);
  }
}

async function updateLeadStatus(id, status) {
  if (!status) return;
  try {
    const res = await fetch(`/api/customers/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update disposition');

    fetchAnalytics();
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchReminders();
    fetchChaseAIReport();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();

    if (data.chase_assigned_to) {
      console.info(`Lead #${id} routed to chase agent #${data.chase_assigned_to}`);
    }
  } catch (err) {
    alert(err.message);
    fetchLeads(currentLeadPage);
  }
}

async function claimChaseLead(id) {
  try {
    const res = await fetch(`/api/customers/${id}/claim-chase`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to claim chase lead');
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchChaseAIReport();
  } catch (err) {
    alert(err.message);
  }
}

async function assignLead(id, assigned_to) {
  try {
    const res = await fetch(`/api/customers/${id}/assign`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ assigned_to: assigned_to ? parseInt(assigned_to, 10) : null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to assign closer');

    fetchAnalytics();
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
  } catch (err) {
    alert(err.message);
    fetchLeads(currentLeadPage);
  }
}

async function deleteLead(id) {
  if (!confirm('Are you sure you want to delete this lead?')) return;
  try {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete lead');
    fetchAnalytics();
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchReminders();
    if (typeof fetchAuditLogs === 'function') fetchAuditLogs();
  } catch (err) {
    alert(err.message);
  }
}

async function fetchAuditLogs() {
  try {
    const res = await fetch('/api/audit-logs', { headers: getAuthHeaders() });
    const logs = await res.json();
    if (res.ok) {
      renderAuditTable(logs);
    }
  } catch (err) {
    console.error('Error fetching audit logs:', err);
  }
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;
  tbody.innerHTML = logs.map(log => `
    <tr class="transition-colors">
      <td class="p-3 text-xs opacity-75">${new Date(log.created_at).toLocaleString()}</td>
      <td class="p-3 font-semibold">${log.user_name || 'System'}</td>
      <td class="p-3 text-blue-500">${log.lead_name || 'N/A'}</td>
      <td class="p-3"><span class="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">${log.action_type}</span></td>
      <td class="p-3 text-xs opacity-75">${log.details}</td>
    </tr>
  `).join('');
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

function switchTab(viewName) {
  document.querySelectorAll('#crm-nav .crm-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===viewName));
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'super_admin';

  const pipelineSection = document.getElementById('dashboard-section');
  const reportsSection = document.getElementById('reports-view');
  const agentsSection = document.getElementById('agents-view');
  const slotDashboardSection = document.getElementById('slot-dashboard-view');
  
  if (pipelineSection) pipelineSection.classList.add('hidden');
  if (reportsSection) reportsSection.classList.add('hidden');
  if (agentsSection) agentsSection.classList.add('hidden');
  if (slotDashboardSection) slotDashboardSection.classList.add('hidden');

  if (viewName === 'reports') {
    if (!REPORT_MANAGEMENT_ROLES.includes(userRole) && userRole !== 'chase') {
      alert('Access Denied: Reporting is not available for this role.');
      return;
    }
    if (reportsSection) {
      reportsSection.classList.remove('hidden');
      renderReports();
      if (userRole === 'chase' || REPORT_MANAGEMENT_ROLES.includes(userRole)) fetchChaseAIReport();
    }
  } else if (viewName === 'agents') {
    if (!isSuperAdmin && userRole !== 'admin') {
      alert('Access Denied: Agent Management is restricted to Admin & Super Admin.');
      return;
    }
    if (agentsSection) {
      agentsSection.classList.remove('hidden');
      fetchUsers();
    }
  } else if (viewName === 'slots') {
    if (slotDashboardSection) {
      slotDashboardSection.classList.remove('hidden');
      const weekPicker = document.getElementById('slot-week-picker');
      const selectedDate = weekPicker ? weekPicker.value : new Date().toISOString().slice(0, 10);
      fetchSlotDashboardData(selectedDate);
    }
  } else {
    if (pipelineSection) pipelineSection.classList.remove('hidden');
  }
}

async function fetchSlotDashboardData(dateStr) {
  try {
    const query = dateStr ? `?date=${dateStr}` : '';
    const res = await fetch(`/api/slots/dashboard${query}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load slot dashboard data');
    const data = await res.json();
    renderSlotDashboard(data, dateStr || new Date().toISOString().slice(0, 10));
  } catch (err) {
    console.error('Slot Dashboard Error:', err);
    const container = document.getElementById('slot-dashboard-view');
    if (container) {
      container.innerHTML = `
        <div class="card-glass p-6 rounded-xl border border-rose-500/30 text-rose-500">
          <div class="font-bold">Unable to load Slot Dashboard</div>
          <div class="text-xs mt-1 opacity-80">${escapeSlotHtml(err.message || 'API unavailable')}</div>
          <button onclick="fetchSlotDashboardData(document.getElementById('slot-week-picker')?.value)"
            class="mt-3 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">Retry</button>
        </div>
      `;
    }
  }
}

function escapeSlotHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

function renderSlotDashboard(data, activeDate) {
  let container = document.getElementById('slot-dashboard-view');
  if (!container) {
    const mainContent = document.querySelector('main') || document.body;
    container = document.createElement('div');
    container.id = 'slot-dashboard-view';
    container.className = 'hidden space-y-6 animate-fade-in';
    mainContent.appendChild(container);
  }

  const closers = (data.closers && data.closers.length > 0)
    ? data.closers
    : globalUsers.filter(u => (u.role || '').toLowerCase().trim() === 'closer');

  const weekdays = Array.isArray(data.weekdays) && data.weekdays.length
    ? data.weekdays
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const slots = Array.isArray(data.slots) && data.slots.length
    ? data.slots
    : BOOKING_SLOTS;

  // Normalize the API into a fast lookup:
  // closer_id + day + time => appointment.
  const bookingMap = new Map();
  (data.bookings || []).forEach(booking => {
    const key = `${booking.closer_id}|${booking.day_of_week}|${booking.time_slot}`;
    bookingMap.set(key, booking);
  });

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-xl font-bold">Weekly Closer Booking Schedule & Slots</h2>
        <p class="text-xs opacity-75">Every lead submitted by a fronter is linked to its selected closer, day and time slot.</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs font-semibold opacity-75">Select Week / Date:</label>
        <input type="date" id="slot-week-picker" value="${escapeSlotHtml(activeDate || new Date().toISOString().slice(0, 10))}"
          onchange="fetchSlotDashboardData(this.value)"
          class="p-2 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700">
        <button type="button" onclick="fetchSlotDashboardData(document.getElementById('slot-week-picker')?.value)"
          class="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
          Refresh
        </button>
      </div>
    </div>

    <div class="card-glass p-6 rounded-xl shadow-xl overflow-x-auto">
      <table class="w-full border-collapse text-left text-xs min-w-[1100px]">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-800">
            <th class="p-3 font-bold uppercase tracking-wider">Closer Name</th>
            ${weekdays.map(day => `<th class="p-3 font-bold uppercase tracking-wider text-center">${escapeSlotHtml(day)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
          ${closers.length === 0
            ? `<tr><td colspan="${weekdays.length + 1}" class="p-6 text-center opacity-60">No closer agents found in the system.</td></tr>`
            : closers.map(closer => `
              <tr class="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40">
                <td class="p-3 font-semibold text-sm align-top">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    ${escapeSlotHtml(closer.full_name || closer.name || closer.email)}
                  </div>
                </td>
                ${weekdays.map(day => `
                  <td class="p-3 align-top border-l border-slate-200 dark:border-slate-800">
                    <div class="space-y-1.5">
                      ${slots.map(slotTime => {
                        const key = `${closer.id}|${day}|${slotTime}`;
                        const booking = bookingMap.get(key);

                        if (booking) {
                          const statusClass = booking.status === 'Completed'
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-rose-500/40 bg-rose-500/10';
                          const customerStatus = booking.customer_status || 'Pending';
                          return `
                            <button type="button"
                              onclick="openSlotLeadModal(${booking.customer_id})"
                              class="w-full text-left p-2 rounded-lg border ${statusClass} text-[10px] leading-tight hover:ring-2 hover:ring-blue-500/50 transition-all cursor-pointer"
                              title="Open customer details and disposition">
                              <div class="flex items-center justify-between gap-2">
                                <span class="font-mono font-bold">${escapeSlotHtml(slotTime)}</span>
                                <span class="font-bold text-[9px]">${escapeSlotHtml(customerStatus)}</span>
                              </div>
                              <div class="font-semibold mt-1 truncate" title="${escapeSlotHtml(booking.customer_name || '')}">
                                ${escapeSlotHtml(booking.customer_name || 'Booked Lead')}
                              </div>
                              <div class="opacity-70 truncate">
                                ${escapeSlotHtml(booking.phone_number || '')}
                              </div>
                              <div class="opacity-60 mt-0.5">
                                Fronted by: ${escapeSlotHtml(booking.fronter_name || 'Unknown')}
                              </div>
                            </button>
                          `;
                        }

                        return `
                          <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/10 text-[10px]">
                            <span class="font-mono font-semibold">${escapeSlotHtml(slotTime)}</span>
                            <span class="text-emerald-600 dark:text-emerald-400 font-bold">AVAILABLE</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </td>
                `).join('')}
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;
}



async function openSlotLeadModal(customerId) {
  const fallback = globalLeads.find(l => Number(l.id) === Number(customerId));
  try {
    const res = await fetch(`/api/customers/${customerId}`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load customer details.');
    showSlotLeadModal(data.customer || data);
  } catch (err) {
    if (fallback) showSlotLeadModal(fallback);
    else alert(err.message || 'Failed to load customer details.');
  }
}

function ensureSlotLeadModal() {
  let modal = document.getElementById('slot-lead-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'slot-lead-modal';
  modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="card-glass w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl shadow-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-[var(--border-main)] pb-4">
        <div>
          <h3 id="slot-modal-name" class="text-lg font-bold">Customer Details</h3>
          <p id="slot-modal-meta" class="text-xs opacity-75 mt-1"></p>
        </div>
        <button type="button" onclick="closeSlotLeadModal()" class="text-slate-400 hover:text-white text-sm font-bold">&times; Close</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <div class="p-3 rounded-xl bg-slate-500/5 border border-[var(--border-main)]">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Fronter</div>
          <div id="slot-modal-fronter" class="font-semibold text-sm mt-1">-</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-500/5 border border-[var(--border-main)]">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Closer</div>
          <div id="slot-modal-closer" class="font-semibold text-sm mt-1">-</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-500/5 border border-[var(--border-main)] sm:col-span-2">
          <div class="text-[10px] uppercase tracking-wider opacity-60">Current Disposition</div>
          <div id="slot-modal-current-status" class="font-bold text-sm mt-1"></div>
        </div>
      </div>

      <div class="mt-5">
        <label class="block text-xs font-bold uppercase tracking-wider opacity-75 mb-1">Closer Disposition</label>
        <select id="slot-modal-disposition" class="w-full p-3 text-sm rounded-xl"></select>
        <p id="slot-modal-permission" class="text-[10px] opacity-60 mt-1"></p>
      </div>

      <div class="mt-5 p-4 rounded-xl border border-[var(--border-main)]">
        <div class="text-xs font-bold uppercase tracking-wider opacity-75 mb-3">Reschedule Booking</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select id="slot-modal-day" class="w-full p-2.5 text-xs">
            <option value="">Select Day...</option>
            <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
            <option>Thursday</option><option>Friday</option>
          </select>
          <select id="slot-modal-time" class="w-full p-2.5 text-xs">
            <option value="">Select Time Slot...</option>
            ${BOOKING_SLOTS.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <button type="button" onclick="rescheduleSlotLead()" class="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl">
          Reschedule Booking
        </button>
      </div>

      <div class="flex justify-end gap-3 border-t border-[var(--border-main)] pt-4 mt-5">
        <button type="button" onclick="closeSlotLeadModal()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800">Cancel</button>
        <button type="button" onclick="saveSlotLeadDisposition()" class="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white">
          Save Disposition
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

let activeSlotLead = null;

function showSlotLeadModal(lead) {
  activeSlotLead = lead;
  const modal = ensureSlotLeadModal();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = (user.role || '').toLowerCase().trim();
  const isCloser = role === 'closer';
  const currentStatus = lead.status || lead.customer_status || 'Pending';

  document.getElementById('slot-modal-name').textContent = lead.customer_name || 'Customer';
  document.getElementById('slot-modal-meta').textContent =
    `Phone: ${lead.phone_number || 'N/A'} | DOB: ${lead.date_of_birth ? String(lead.date_of_birth).split('T')[0] : 'N/A'}`;
  document.getElementById('slot-modal-fronter').textContent = lead.fronter_name || 'Unknown';
  document.getElementById('slot-modal-closer').textContent = lead.closer_name || lead.appointment_closer_name || 'Unknown';
  document.getElementById('slot-modal-current-status').textContent = currentStatus;

  const disposition = document.getElementById('slot-modal-disposition');
  disposition.innerHTML = CLOSER_DISPOSITIONS.map(d =>
    `<option value="${escapeSlotHtml(d)}" ${currentStatus === d ? 'selected' : ''}>${escapeSlotHtml(d)}</option>`
  ).join('');
  disposition.disabled = !isCloser;
  document.getElementById('slot-modal-permission').textContent =
    isCloser ? 'You can update the disposition for your booked leads.' :
    'Disposition changes are available to the assigned closer.';

  document.getElementById('slot-modal-day').value = lead.booking_day || '';
  document.getElementById('slot-modal-time').value = lead.booking_time || '';

  modal.classList.remove('hidden');
}

function closeSlotLeadModal() {
  document.getElementById('slot-lead-modal')?.classList.add('hidden');
  activeSlotLead = null;
}

async function saveSlotLeadDisposition() {
  if (!activeSlotLead) return;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if ((user.role || '').toLowerCase().trim() !== 'closer') {
    return alert('Only the assigned closer can set the slot disposition.');
  }

  const status = document.getElementById('slot-modal-disposition').value;
  try {
    const res = await fetch(`/api/customers/${activeSlotLead.id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save disposition.');

    closeSlotLeadModal();
    await fetchSlotDashboardData(document.getElementById('slot-week-picker')?.value);
    fetchLeads(currentLeadPage);
    fetchUnassignedLeads();
    fetchAnalytics();
    fetchReminders();
  } catch (err) {
    alert(err.message);
  }
}

async function rescheduleSlotLead() {
  if (!activeSlotLead) return;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if ((user.role || '').toLowerCase().trim() !== 'closer') {
    return alert('Only the assigned closer can reschedule this booking.');
  }

  const day = document.getElementById('slot-modal-day').value;
  const time = document.getElementById('slot-modal-time').value;
  if (!day || !time) return alert('Please select a day and time.');

  try {
    const res = await fetch(`/api/customers/${activeSlotLead.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        customer_name: activeSlotLead.customer_name,
        phone_number: activeSlotLead.phone_number,
        date_of_birth: activeSlotLead.date_of_birth,
        booking_day: day,
        booking_time: time,
        closer_id: activeSlotLead.closer_id,
        notes: activeSlotLead.notes,
        status: 'Customer Re-scheduled'
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reschedule booking.');

    closeSlotLeadModal();
    await fetchSlotDashboardData(document.getElementById('slot-week-picker')?.value);
    fetchLeads(currentLeadPage);
    fetchReminders();
    fetchAnalytics();
  } catch (err) {
    alert(err.message);
  }
}

function checkReportingAccess(userParam) {
  const user = userParam || JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();
  
  const reportBtn = document.getElementById('nav-reports-btn');
  if (reportBtn) {
    if (REPORT_MANAGEMENT_ROLES.includes(userRole) || userRole === 'chase') {
      reportBtn.classList.remove('hidden');
      reportBtn.style.display = '';
      
      const subtitle = document.getElementById('report-role-subtitle');
      if (subtitle) {
        subtitle.innerText = `${userRole.toUpperCase()} Dashboard: Full team oversight and disposition breakdown.`;
      }
    } else {
      reportBtn.classList.add('hidden');
      reportBtn.style.display = 'none';
    }
  }
}

function renderReports() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();

  if (!REPORT_MANAGEMENT_ROLES.includes(userRole) && userRole !== 'chase') return;

  const timeframe = document.getElementById('report-timeframe')?.value || 'all';
  const now = new Date();

  const filteredLeads = (globalLeads || []).filter(l => {
    if (timeframe === 'all') return true;
    if (!l.created_at) return true;
    const leadDate = new Date(l.created_at);
    
    if (timeframe === 'today') {
      return leadDate.toDateString() === now.toDateString();
    }
    if (timeframe === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return leadDate >= oneWeekAgo;
    }
    if (timeframe === 'month') {
      return leadDate.getMonth() === now.getMonth() && leadDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const total = filteredLeads.length;

  const closedWon = filteredLeads.filter(l => l.status === 'Deal Closed / Won' || l.status === 'Deal Won/Closed' || l.status === 'Customer Form Completed').length;
  const inProgress = filteredLeads.filter(l => ['Pending', 'Customer On Call', 'Customer Re-scheduled', 'Customer Form Sent', 'Follow-up Required'].includes(l.status)).length;
  const lost = filteredLeads.filter(l => ["Customer Didn't Pick Up", 'Not Interested / Lost', 'Not Interested/Lost'].includes(l.status)).length;
  
  const winRate = total > 0 ? ((closedWon / total) * 100).toFixed(1) : 0;

  const kpiTotal = document.getElementById('kpi-total-leads');
  const kpiClosed = document.getElementById('kpi-closed-won');
  const kpiWin = document.getElementById('kpi-win-rate');
  const kpiProgress = document.getElementById('kpi-in-progress');
  const kpiLost = document.getElementById('kpi-lost-leads');

  if (kpiTotal) kpiTotal.innerText = total;
  if (kpiClosed) kpiClosed.innerText = closedWon;
  if (kpiWin) kpiWin.innerText = `${winRate}% Conversion Rate`;
  if (kpiProgress) kpiProgress.innerText = inProgress;
  if (kpiLost) kpiLost.innerText = lost;

  renderDispositionBreakdown(filteredLeads, total);
  renderAgentLeaderboard(filteredLeads);
}

function renderDispositionBreakdown(leads, total) {
  const container = document.getElementById('disposition-metrics-list');
  if (!container) return;

  const counts = {};
  DISPOSITIONS.forEach(d => counts[d] = 0);

  leads.forEach(l => {
    const status = l.status || 'Pending';
    counts[status] = (counts[status] || 0) + 1;
  });

  container.innerHTML = Object.entries(counts).map(([disp, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    
    let colorClass = 'bg-blue-500';
    if (disp === 'Deal Closed / Won' || disp === 'Deal Won/Closed' || disp === 'Customer Form Completed') colorClass = 'bg-emerald-500';
    if (disp === "Customer Didn't Pick Up" || disp === 'Not Interested / Lost' || disp === 'Not Interested/Lost') colorClass = 'bg-rose-500';
    if (disp === 'Pending' || disp === 'Customer On Call' || disp === 'Customer Re-scheduled') colorClass = 'bg-amber-500';

    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium">${disp}</span>
          <span class="opacity-75 font-semibold">${count} (${pct}%)</span>
        </div>
        <div class="disposition-bar-bg">
          <div class="disposition-bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAgentLeaderboard(leads) {
  const tbody = document.getElementById('agent-performance-body');
  if (!tbody) return;

  const agentMap = {};
  (globalUsers || []).forEach(u => {
    agentMap[u.id] = { name: u.full_name || u.name || u.email, total: 0, formSent: 0, closed: 0 };
  });

  leads.forEach(l => {
    if (l.assigned_to && agentMap[l.assigned_to]) {
      const stats = agentMap[l.assigned_to];
      stats.total++;
      if (l.status === 'Customer Form Sent') stats.formSent++;
      if (l.status === 'Deal Closed / Won' || l.status === 'Deal Won/Closed' || l.status === 'Customer Form Completed') stats.closed++;
    }
  });

  const activeAgents = Object.values(agentMap).filter(a => a.total > 0);

  if (activeAgents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center opacity-60 text-xs">No assigned agent metrics recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = activeAgents.map(a => {
    const winRate = a.total > 0 ? ((a.closed / a.total) * 100).toFixed(1) : 0;
    return `
      <tr class="transition-colors">
        <td class="p-2 font-semibold">${a.name}</td>
        <td class="p-2">${a.total}</td>
        <td class="p-2 text-amber-500">${a.formSent}</td>
        <td class="p-2 text-emerald-500 font-bold">${a.closed}</td>
        <td class="p-2"><span class="bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded text-[10px] font-bold">${winRate}%</span></td>
      </tr>
    `;
  }).join('');
}

function exportReportData() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = (user.role || '').toLowerCase();

  if (!REPORT_MANAGEMENT_ROLES.includes(userRole)) {
    alert('Access Denied: Exporting report data is restricted to Super Admin, Admin, and Manager roles.');
    return;
  }

  if (!globalLeads || globalLeads.length === 0) return alert('No analytics data available to export.');
  
  let csvContent = "data:text/csv;charset=utf-8,ID,Customer Name,Phone,Status,Assigned Agent,Created Date\n";
  globalLeads.forEach(l => {
    csvContent += `"${l.id}","${l.customer_name || ''}","${l.phone_number || ''}","${l.status || 'Pending'}","${l.assigned_to_name || l.assigned_to || 'Unassigned'}","${l.created_at || ''}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `crm_analytics_report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.openSlotDashboardWindow = function() {
  if (typeof switchTab === 'function') {
    switchTab('slots');
  } else {
    console.error("switchTab function is not available.");
  }
};