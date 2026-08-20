/* ==========================================================================
   Voice Nation Operations Console — Application Logic
   Zero-build vanilla JS. Talks to the existing Express/Knex API untouched.
   ========================================================================== */

const API = '/api';

const state = {
  token: null,
  user: null,
  view: 'overview',
  leads: [],
  users: [],
  analytics: {},
  aiReport: null,
  aiLoading: false,
  slotDashboard: null,
  slotLoading: false,
  slotsSelectedDate: new Date().toISOString().slice(0, 10),
  slotsSelectedDay: null,
  slotsSelectedAgent: null,
  liveAgents: null,
  liveAgentsLoading: false,
  tvMode: false,
  pendingTasks: null,
  chaseTodo: null,
  chaseTodoLoading: false,
  myReport: null,
  myReportLoading: false,
  myReportPeriod: 'daily',
  advReport: null,
  advReportLoading: false,
  advReportRange: 'all',
  advReportCustom: { start: '', end: '' },
  sidebarOpen: false,
  search: ''
};

const CLOSER_STATUSES = [
  "Customer Doesn't Qualify",
  "Customer Didn't Pick Up",
  "Customer Not Interested",
  "Customer On Call",
  "Customer Re-scheduled",
  "Customer Form Completed"
];
const NOTES_ROLES = ['closer', 'manager', 'chase', 'admin', 'superadmin', 'super_admin'];
const QA_ROLES = ['qa', 'admin', 'superadmin', 'super_admin', 'manager'];
const CHASE_STAGE_STATUSES = ['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'];

const BOOKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BOOKING_SLOTS = ['9:15 AM', '10:15 AM', '11:30 AM', '12:45 PM', '1:45 PM', '3:00 PM', '4:15 PM', '5:00 PM'];

/* ---------------------------------------------------------------------- */
/* Icons (feather-style inline SVG, zero dependencies)                     */
/* ---------------------------------------------------------------------- */
const ic = {
  grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  sparkles: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
  bar: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chev: '<path d="M9 18l6-6-6-6"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M7 17L17 7M17 7H8M17 7v9"/>',
  down: '<path d="M7 7l10 10M17 17H8M17 17V8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0 0 20.5 15"/>',
  filePlus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.5 2.9.6a2 2 0 0 1 1.7 2z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  bellRing: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><path d="M18 3a4 4 0 0 1 3 4"/><path d="M6 3a4 4 0 0 0-3 4"/>',
  listCheck: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5L18 10M18.5 4.5L21 7"/>',
  reportAi: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z"/><circle cx="19" cy="18" r="2.2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>'
};
function svg(name, cls) { return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic[name] || ''}</svg>`; }

/* ---------------------------------------------------------------------- */
/* Utilities                                                               */
/* ---------------------------------------------------------------------- */
const esc = x => String(x ?? '').replace(/[&<>'"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]));
function normRole(r) { return String(r || '').trim().toLowerCase(); }
function role() { return normRole(state.user?.role); }
function isMgmt() { return ['admin', 'superadmin', 'super_admin', 'manager'].includes(role()); }
function isFronterRole() { return ['fronter', 'fronting'].includes(role()); }
function canSeeNotes() { return NOTES_ROLES.includes(role()); }
function canGradeQa() { return QA_ROLES.includes(role()); }
function initials(name) { return String(name || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'; }
function weekdayFromDateStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}
function nearestBookingDay(dateStr) {
  // Bookings only exist Mon–Fri; weekend dates snap to the nearest weekday.
  const wd = weekdayFromDateStr(dateStr);
  if (BOOKING_DAYS.includes(wd)) return wd;
  return wd === 'Saturday' ? 'Friday' : 'Monday';
}
function fmtDateTime(d) { return d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; }

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}`, ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `${svg(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<span>${esc(msg)}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3400);
}

/* ---------------------------------------------------------------------- */
/* SLA helpers                                                             */
/* ---------------------------------------------------------------------- */
function slaTarget(lead) {
  if (lead.status === 'Customer Form Completed') return { due: lead.chase_due_at, label: '24h Send SLA', total: 24 * 3600000 };
  if (lead.status === 'Customer Form Sent') return { due: lead.chase_return_due_at, label: '7d Return SLA', total: 7 * 86400000 };
  return null;
}
function slaState(lead) {
  const t = slaTarget(lead);
  if (!t || !t.due) return { state: 'none', label: '—' };
  const ms = new Date(t.due) - Date.now();
  if (ms <= 0) return { state: 'overdue', label: 'OVERDUE', ms, target: t };
  const soon = ms < t.total * 0.15;
  return { state: soon ? 'soon' : 'ok', label: fmtDuration(ms), ms, target: t };
}
function fmtDuration(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
function slaChip(lead) {
  const s = slaState(lead);
  if (s.state === 'none') return `<span class="sla-chip none">${svg('chev')} No SLA</span>`;
  const icon = s.state === 'overdue' ? 'alert' : 'clock';
  return `<span class="sla-chip ${s.state}">${svg(icon)} ${s.label}</span>`;
}
function slaRing(lead, size = 46) {
  const s = slaState(lead);
  if (s.state === 'none') return '';
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  const pct = s.state === 'overdue' ? 0 : Math.max(0, Math.min(1, s.ms / s.target.total));
  const color = s.state === 'overdue' ? 'var(--bad)' : s.state === 'soon' ? 'var(--warn)' : 'var(--good)';
  return `<svg class="sla-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}
function overdueLeads(list) { return list.filter(l => slaState(l).state === 'overdue'); }

/* ---------------------------------------------------------------------- */
/* Auth                                                                    */
/* ---------------------------------------------------------------------- */
function applyTheme() { document.documentElement.dataset.theme = localStorage.getItem('vn_theme') || 'dark'; }
function toggleTheme() {
  const next = (localStorage.getItem('vn_theme') || 'dark') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('vn_theme', next);
  applyTheme();
}

function renderLogin() {
  document.getElementById('app').innerHTML = `
  <div class="login-screen">
    <div class="login-emblem login-emblem-corner-tl"></div>
    <div class="login-emblem login-emblem-corner-br"></div>
    <div class="login-emblem login-emblem-hero"></div>
    <div class="login-grid"></div>
    <form class="login-card scale-in" id="loginForm">
      <div class="login-mark">
        <img class="brand-logo-icon" src="/assets/voice-nation-logo.png" alt="Voice Nation BPO">
        <div><b>Voice Nation BPO</b><span>Operations Console</span></div>
      </div>
      <h1>Sign in</h1>
      <p>Secure access to the lead, closer and chase pipeline.</p>
      <div class="login-gd-badge"><img src="/assets/golden-days-logo.png" alt="Golden Days"></div>
      <div class="field"><label>Email</label><input id="loginEmail" type="email" required autocomplete="username"></div>
      <div class="field"><label>Password</label><input id="loginPassword" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block" type="submit">Sign in ${svg('arrowRight')}</button>
      <div id="loginErr" class="login-error hidden"></div>
      <div class="login-foot">Contact your Super Admin if you need access.</div>
    </form>
  </div>`;
  document.getElementById('loginForm').addEventListener('submit', doLogin);
}

async function doLogin(e) {
  e.preventDefault();
  const errBox = document.getElementById('loginErr');
  errBox.classList.add('hidden');
  try {
    const d = await fetch(API + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('loginEmail').value.trim(), password: document.getElementById('loginPassword').value })
    }).then(async r => { const x = await r.json(); if (!r.ok) throw new Error(x.error || 'Invalid credentials'); return x; });
    state.token = d.token; state.user = d.user;
    localStorage.setItem('vn_token', state.token);
    localStorage.setItem('vn_user', JSON.stringify(state.user));
    await boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  }
}

function logout() {
  localStorage.removeItem('vn_token'); localStorage.removeItem('vn_user');
  state.token = null; state.user = null;
  renderLogin();
}

/* ---------------------------------------------------------------------- */
/* Shell / Navigation                                                      */
/* ---------------------------------------------------------------------- */
const NAV = {
  overview: { label: 'Overview', icon: 'grid', roles: 'all' },
  leads: { label: 'Lead Queue', icon: 'target', roles: ['fronter', 'fronting'] },
  myReports: { label: 'My Reports', icon: 'calendar', roles: ['fronter', 'fronting'] },
  closerQueue: { label: 'My Closer Queue', icon: 'target', roles: ['closer'] },
  allLeads: { label: 'All Leads', icon: 'target', roles: ['qa'], mgmtToo: true },
  slots: { label: 'Booking Slots', icon: 'calendar', roles: 'all' },
  chase: { label: 'Chase Operations', icon: 'clock', roles: ['chase'], badge: true },
  intelligence: { label: 'AI Intelligence', icon: 'sparkles', roles: ['chase'], mgmtToo: true },
  team: { label: 'Team & Access', icon: 'users', roles: 'mgmt' },
  reports: { label: 'Reports', icon: 'bar', roles: ['closer', 'chase', 'qa'], mgmtToo: true }
};
function navAllowed(key) {
  const cfg = NAV[key];
  const r = role();
  if (cfg.roles === 'all') return true;
  if (cfg.roles === 'mgmt') return isMgmt();
  if (cfg.mgmtToo && isMgmt()) return true;
  return Array.isArray(cfg.roles) && cfg.roles.includes(r);
}
function pageMeta(view) {
  const meta = {
    overview: ['Overview', 'Live snapshot of your pipeline'],
    leads: ['My Submitted Leads', 'Locked after submission — track closer outcomes'],
    myReports: ['My Reports', 'Daily, weekly and monthly performance plus QA scores'],
    closerQueue: ['My Closer Queue', 'Own leads are editable; other closer leads are view-only'],
    allLeads: ['Lead Queue', 'Full operational pipeline'],
    slots: ['Booking Slots', 'Weekly closer availability at a glance'],
    chase: ['Chase Operations', 'Physical-form SLA queue'],
    intelligence: ['AI Intelligence', 'Automated chase performance reporting'],
    team: ['Team & Access', 'Roles, assignments and permissions'],
    reports: [isMgmt() ? 'Advanced Reporting' : 'Reports', isMgmt() ? 'Full analytics, exports and AI-driven insights' : 'Disposition and performance breakdown']
  };
  return meta[view] || ['Operations', ''];
}

function renderShell() {
  const name = state.user.full_name || state.user.email;
  const r = role();
  const rLabel = r.replace('_', ' ').toUpperCase();
  const navKeys = Object.keys(NAV).filter(navAllowed);
  document.getElementById('app').innerHTML = `
    <div class="shell">
      <div class="sidebar-overlay" id="sidebarOverlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <img class="brand-logo-icon" src="/assets/voice-nation-logo.png" alt="Voice Nation BPO">
          <div><b>Voice Nation BPO</b><span>Golden Days CRM</span></div>
        </div>
        <div class="gd-chip sidebar-gd-chip"><img src="/assets/golden-days-logo.png" alt="Golden Days"></div>
        <div class="nav-group">
          <div class="nav-label">Workspace</div>
          <nav class="nav" id="navList">
            ${navKeys.map(k => `<button class="nav-btn" data-view="${k}">${svg(NAV[k].icon)}<span>${NAV[k].label}</span>${NAV[k].badge ? '<span class="nav-badge hidden" id="navChaseBadge">0</span>' : ''}</button>`).join('')}
          </nav>
        </div>
        <div class="sidebar-bottom">
          <div class="user-card">
            <span class="avatar">${esc(initials(name))}</span>
            <div class="who"><strong>${esc(name)}</strong><span class="role-chip role-${r.replace('_', '')}">${esc(rLabel)}</span></div>
          </div>
          <div class="side-actions">
            <button class="btn btn-soft btn-sm" id="themeBtnSide" title="Toggle theme">${svg('moon')} Theme</button>
            <button class="btn btn-soft btn-sm" id="logoutBtn" title="Sign out">${svg('logout')}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div class="flex items-center gap-12" style="min-width:0">
            <button class="icon-btn" id="menuBtn" style="display:none"><span>${svg('menu')}</span></button>
            <div class="topbar-title">
              <h1 id="pageTitle">Overview</h1>
              <p id="pageSub">Live snapshot</p>
            </div>
          </div>
          <div class="topbar-actions">
            <div class="gd-chip topbar-gd-chip" title="Built for Golden Days"><img src="/assets/golden-days-logo.png" alt="Golden Days"></div>
            <span class="status-pulse"><i></i><span class="txt">System online</span></span>
            ${role() !== 'fronter' && role() !== 'fronting' ? `<div class="notif-wrap">
              <button class="icon-btn" id="notifBtn" title="Pending tasks">${svg('bellRing')}<span class="dot-badge hidden" id="notifDot"></span></button>
              <div class="notif-panel hidden" id="notifPanel"></div>
            </div>` : ''}
            <button class="icon-btn" id="refreshBtn" title="Refresh data">${svg('refresh')}</button>
            <button class="icon-btn" id="themeBtnTop" title="Toggle theme">${svg('sun')}</button>
          </div>
        </div>
        <div id="overdueBanner"></div>
        <div class="page" id="content"></div>
      </div>
    </div>
    <div class="toast-stack" id="toastStack"></div>
  `;
  document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('notifBtn')?.addEventListener('click', toggleNotifPanel);
  document.getElementById('themeBtnSide').addEventListener('click', () => { toggleTheme(); syncThemeIcons(); });
  document.getElementById('themeBtnTop').addEventListener('click', () => { toggleTheme(); syncThemeIcons(); });
  document.getElementById('refreshBtn').addEventListener('click', () => refresh(true));
  const menuBtn = document.getElementById('menuBtn');
  menuBtn.addEventListener('click', () => setSidebar(true));
  document.getElementById('sidebarOverlay').addEventListener('click', () => setSidebar(false));
  syncThemeIcons();
  go(navKeys.includes('overview') ? 'overview' : navKeys[0]);
}
function syncThemeIcons() {
  const dark = (localStorage.getItem('vn_theme') || 'dark') === 'dark';
  ['themeBtnSide', 'themeBtnTop'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.innerHTML = svg(dark ? 'sun' : 'moon') + (id === 'themeBtnSide' ? ' Theme' : '');
  });
}
function setSidebar(open) {
  state.sidebarOpen = open;
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('sidebarOverlay').classList.toggle('show', open);
}

function go(view) {
  state.view = view;
  setSidebar(false);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const [title, sub] = pageMeta(view);
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent = sub;
  renderOverdueBanner();
  renderView();
  if (view === 'intelligence') { loadAiReport(); loadChaseTodo(); }
  if (view === 'chase') loadChaseTodo();
  if (view === 'slots') loadSlotDashboard();
  if (view === 'myReports') loadMyReports('daily');
  if (view === 'reports' && isMgmt()) loadAdvancedReport('all');
}

function renderOverdueBanner() {
  const box = document.getElementById('overdueBanner');
  if (!box) return;
  const relevant = ['chase', 'admin', 'superadmin', 'super_admin', 'manager'].includes(role());
  const over = overdueLeads(state.leads);
  if (!relevant || !over.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="sla-banner">${svg('alert')} ${over.length} chase task${over.length > 1 ? 's are' : ' is'} OVERDUE — physical-form SLA has lapsed
    <button onclick="go('chase')">${role() === 'chase' ? 'Resolve now' : 'View queue'}</button></div>`;
  const badge = document.getElementById('navChaseBadge');
  if (badge) { badge.textContent = over.length; badge.classList.toggle('hidden', !over.length); }
}

/* ---------------------------------------------------------------------- */
/* Data loading                                                            */
/* ---------------------------------------------------------------------- */
async function boot() {
  applyTheme();
  try {
    state.users = await api('/users');
  } catch { state.users = []; }
  renderShell();
  await refresh();
  if (role() !== 'fronter' && role() !== 'fronting') loadPendingTasks();
  setInterval(() => { renderOverdueBanner(); if (['leads', 'closerQueue', 'allLeads', 'chase'].includes(state.view)) renderView(); }, 30000);
  setInterval(() => refresh(false), 60000);
  setInterval(() => { if (role() !== 'fronter' && role() !== 'fronting') loadPendingTasks(); }, 30000);
}
async function loadPendingTasks() {
  try {
    state.pendingTasks = await api('/notifications/pending');
    syncNotifDot();
  } catch { /* silent — notifications are best-effort */ }
}
function syncNotifDot() {
  const dot = document.getElementById('notifDot');
  if (!dot) return;
  const count = state.pendingTasks?.count || 0;
  dot.classList.toggle('hidden', count === 0);
}
function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !opening);
  if (opening) renderNotifPanel();
}
function renderNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const items = state.pendingTasks?.items || [];
  const sevIcon = { urgent: 'alert', normal: 'clock' };
  panel.innerHTML = `
    <div class="notif-head"><strong>Pending Tasks</strong><span class="badge b-neutral">${items.length}</span></div>
    <div class="notif-list">
      ${items.length ? items.map(it => `
        <button type="button" class="notif-item ${it.severity === 'urgent' ? 'urgent' : ''}" ${it.leadId ? `data-notif-lead="${it.leadId}"` : ''}>
          <span class="ni-icon">${svg(sevIcon[it.severity] || 'clock', 'icon-inline')}</span>
          <div class="ni-body"><div class="ni-title">${esc(it.title)}</div><div class="ni-sub">${esc(it.subtitle || '')}</div></div>
        </button>`).join('') : emptyState('All clear', 'No pending tasks right now.', 'check')}
    </div>`;
  panel.querySelectorAll('[data-notif-lead]').forEach(b => b.addEventListener('click', () => {
    panel.classList.add('hidden');
    openLeadDrawer(Number(b.dataset.notifLead));
  }));
}
document.addEventListener('click', e => {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBtn');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!panel.contains(e.target) && !btn?.contains(e.target)) panel.classList.add('hidden');
});

async function refresh(manual) {
  try {
    const [an, cust] = await Promise.all([api('/analytics'), api('/customers?page=1&limit=200')]);
    state.analytics = an;
    state.leads = cust.data || [];
    renderOverdueBanner();
    renderView();
    if (manual) toast('Data refreshed', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ---------------------------------------------------------------------- */
/* Shared render bits                                                      */
/* ---------------------------------------------------------------------- */
function kpiCard({ label, value, sub, icon, tone }) {
  return `<div class="card kpi ${tone ? 'tone-' + tone : ''}">
    <div class="kpi-top"><span class="label">${esc(label)}</span><span class="kpi-icon">${svg(icon)}</span></div>
    <div class="value tabular">${value}</div>
    <div class="delta flat">${esc(sub || '')}</div>
  </div>`;
}
function statusBadge(status) {
  const map = {
    'Pending': 'b-neutral',
    'Customer Form Completed': 'b-warn',
    'Customer Form Sent': 'b-info',
    'Customer Form Received': 'b-good',
    'Customer Form Not Received': 'b-bad',
    'Deal Closed / Won': 'b-good',
    'Deal Won/Closed': 'b-good',
    "Customer Doesn't Qualify": 'b-bad',
    "Customer Didn't Pick Up": 'b-neutral',
    'Customer Not Interested': 'b-bad',
    'Customer On Call': 'b-info',
    'Customer Re-scheduled': 'b-warn'
  };
  return `<span class="badge ${map[status] || 'b-neutral'}">${esc(status || 'Pending')}</span>`;
}
function emptyState(title, sub, icon = 'target') {
  return `<div class="empty-state">${svg(icon)}<strong>${esc(title)}</strong><p>${esc(sub)}</p></div>`;
}

/* ---------------------------------------------------------------------- */
/* View router                                                             */
/* ---------------------------------------------------------------------- */
function renderView() {
  const mount = document.getElementById('content');
  if (!mount) return;
  const fns = { overview: viewOverview, leads: viewLeadsFronter, myReports: viewMyReports, closerQueue: viewCloserQueue, allLeads: viewAllLeads, slots: viewSlots, chase: viewChase, intelligence: viewIntelligence, team: viewTeam, reports: isMgmt() ? viewReportsAdvanced : viewReports };
  mount.innerHTML = (fns[state.view] || viewOverview)();
  wireDynamicHandlers();
}

/* ----- Overview ----- */
function viewOverview() {
  const a = state.analytics, r = role();
  const total = a.totalLeads ?? state.leads.length;
  const completed = a.completedLeads ?? 0;
  const rate = a.completionRate ?? '0.0';
  const over = overdueLeads(state.leads).length;
  const fronterRole = r === 'fronter' || r === 'fronting';

  const heroCopy = {
    fronter: ['Submit once. Track every outcome.', 'Every lead you submit is locked immediately. Your visibility runs through Customer Form Completed \u2014 chase-team activity after that isn\u2019t shown here.'],
    fronting: ['Submit once. Track every outcome.', 'Every lead you submit is locked immediately. Your visibility runs through Customer Form Completed \u2014 chase-team activity after that isn\u2019t shown here.'],
    closer: ['Own your queue. Disposition with control.', 'Your booked leads are yours to disposition. Other closers\u2019 leads stay visible but read-only.'],
    chase: ['Protect every SLA deadline.', '24 hours to send the physical form, 7 days for the customer to return it. Overdue items surface in red.'],
    qa: ['Review calls. Grade with confidence.', 'Score calls out of 100, mark Pass or Fail, and leave remarks agents can see against their lead.'],
  }[r] || ['One pipeline. Full visibility.', 'Ownership, disposition, reassignment and SLA tracking are managed from a single workspace.'];

  const fourthKpi = fronterRole
    ? kpiCard({ label: 'Still In Progress', value: Math.max(0, total - completed), icon: 'clock', tone: 'warn', sub: 'Not yet at Customer Form Completed' })
    : kpiCard({ label: 'SLA Attention', value: over, icon: 'alert', tone: over ? 'bad' : 'good', sub: over ? 'Overdue chase items' : 'All timers on track' });

  return `
  <div class="grid" style="gap:18px">
    <div class="card hero scale-in">
      <span class="hero-eyebrow">${svg('shield')} Operations</span>
      <h2>${esc(heroCopy[0])}</h2>
      <p>${esc(heroCopy[1])}</p>
    </div>
    <div class="grid grid-4">
      ${kpiCard({ label: fronterRole ? 'My Total Leads' : 'Total Leads', value: total, icon: 'target', sub: 'Currently visible in your role' })}
      ${kpiCard({ label: 'Completed / Handoff', value: completed, icon: 'check', tone: 'good', sub: fronterRole ? 'Reached Customer Form Completed' : 'Closer completed disposition' })}
      ${kpiCard({ label: 'Completion Ratio', value: rate + '%', icon: 'bar', tone: 'ai', sub: 'Completed \u00f7 total submitted' })}
      ${fourthKpi}
    </div>
    <div class="grid split-main">
      <div class="card">
        <div class="card-head"><h3>Pipeline Snapshot</h3><button class="btn btn-soft btn-sm" data-goto="${fronterRole ? 'leads' : r === 'closer' ? 'closerQueue' : (isMgmt() || r === 'qa') ? 'allLeads' : 'chase'}">Open queue ${svg('chev')}</button></div>
        <div class="card-pad">${pipelineList(fronterRole)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>${fronterRole ? 'Closer Disposition Mix' : 'Disposition Mix'}</h3></div>
        <div class="card-pad">${dispositionList(fronterRole ? (a.closerDispositionBreakdown || []).map(x => ({ status: x.status, count: x.count })) : null)}</div>
      </div>
    </div>
  </div>`;
}
function pipelineList(fronterRole) {
  const stages = fronterRole
    ? ['Pending', 'Customer Form Completed', 'Deal Closed / Won']
    : ['Pending', 'Customer Form Completed', 'Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received', 'Deal Closed / Won'];
  const total = state.leads.length || 1;
  return `<div class="metric-list">${stages.map(s => {
    const n = state.leads.filter(x => x.status === s).length;
    return `<div class="metric-row"><span class="m-label">${esc(s)}</span><div class="flex items-center" style="flex:1;justify-content:flex-end"><div class="bar-track" style="max-width:140px"><i class="bar-fill" style="width:${Math.min(100, n / total * 100)}%"></i></div><span class="m-val" style="width:30px;text-align:right">${n}</span></div></div>`;
  }).join('')}</div>`;
}
function dispositionList(override) {
  let rows;
  if (override) rows = override;
  else {
    const map = {};
    state.leads.forEach(x => { const s = x.status || 'Pending'; map[s] = (map[s] || 0) + 1; });
    rows = Object.entries(map).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }
  if (!rows.length) return emptyState('No disposition data', 'Data will appear once leads move through the pipeline.', 'bar');
  return `<div class="metric-list">${rows.slice(0, 8).map(r => `<div class="metric-row"><span class="m-label">${esc(r.status)}</span><span class="m-val">${r.count}</span></div>`).join('')}</div>`;
}

/* ----- Fronter: My Submitted Leads ----- */
function viewLeadsFronter() {
  const list = filterBySearch(state.leads);
  return `
  <div class="card">
    <div class="card-head">
      <div><h3>My Submitted Leads</h3><div class="sub">Locked immediately after submission \u2014 visible through Customer Form Completed only</div></div>
      <button class="btn btn-primary btn-sm" id="newLeadBtn">${svg('plus')} Submit Lead</button>
    </div>
    <div class="card-pad">
      <div class="notice">${svg('info')} Once a lead reaches Customer Form Completed, later chase-team activity (SLA timers, chase agent, form status) is handled internally and isn't shown here.</div>
      <div class="toolbar">
        <div class="search-wrap">${svg('search')}<input id="searchInput" placeholder="Search customer or phone" value="${esc(state.search)}"></div>
      </div>
      ${leadsTable(list, { hideSla: true })}
    </div>
  </div>`;
}

/* ----- Fronter: My Reports (daily / weekly / monthly + QA) ----- */
async function loadMyReports(period) {
  state.myReportPeriod = period;
  state.myReportLoading = true;
  if (state.view === 'myReports') renderView();
  try {
    state.myReport = await api('/reports/mine?period=' + period);
  } catch (e) {
    toast(e.message, 'error');
    state.myReport = null;
  } finally {
    state.myReportLoading = false;
    if (state.view === 'myReports') renderView();
  }
}
function viewMyReports() {
  const periods = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
  if (state.myReportLoading || !state.myReport) {
    return `
    <div class="tabs">${periods.map(([k, l]) => `<button class="tab-btn ${state.myReportPeriod === k ? 'active' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
    <div class="card" style="margin-top:14px"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  }
  const r = state.myReport;
  const qa = r.qa;
  const passTone = qa.meetsThreshold === true ? 'good' : qa.meetsThreshold === false ? 'bad' : 'neutral';

  return `
  <div class="tabs">${periods.map(([k, l]) => `<button class="tab-btn ${state.myReportPeriod === k ? 'active' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
  <div class="grid" style="gap:18px;margin-top:14px">
    <div class="grid grid-4">
      ${kpiCard({ label: `${state.myReportPeriod[0].toUpperCase()}${state.myReportPeriod.slice(1)} Leads`, value: r.totalLeads, icon: 'target', sub: fmtDate(r.rangeStart) + ' \u2192 today' })}
      ${kpiCard({ label: 'Reached Form Completed', value: r.completedLeads, icon: 'check', tone: 'good', sub: 'Or further in the pipeline' })}
      ${kpiCard({ label: 'Completion Rate', value: r.completionRate + '%', icon: 'bar', tone: 'ai', sub: 'This period' })}
      ${kpiCard({ label: 'QA Average', value: qa.averageScore != null ? qa.averageScore + '/100' : '\u2014', icon: 'shield', tone: passTone, sub: qa.averageScore != null ? (qa.meetsThreshold ? 'Meets 75% threshold' : 'Below 75% threshold') : 'Not graded yet' })}
    </div>
    <div class="card">
      <div class="card-head"><h3>Leads Over Time</h3></div>
      <div class="card-pad chart-card">${trendChart(r.dailyBreakdown)}</div>
    </div>
    <div class="card">
      <div class="card-head">
        <div><h3>${svg('shield')} My QA Scores</h3><div class="sub">Pass threshold is 75/100 \u2014 ${qa.gradedCount} call${qa.gradedCount === 1 ? '' : 's'} graded${qa.passRate != null ? `, ${qa.passRate}% pass rate` : ''}</div></div>
      </div>
      <div class="card-pad">
        ${qa.entries.length ? `<div class="table-scroll"><table>
          <thead><tr><th>Customer</th><th>Score</th><th>Outcome</th><th>Graded By</th><th>Date</th><th>Remarks</th></tr></thead>
          <tbody>${qa.entries.map(e => `
            <tr>
              <td class="cell-name">${esc(e.customer_name)}</td>
              <td class="tabular" style="font-weight:800;color:${e.qa_score >= 75 ? 'var(--good)' : 'var(--bad)'}">${e.qa_score}/100</td>
              <td><span class="badge ${e.qa_status === 'Pass' ? 'b-good' : 'b-bad'}">${esc(e.qa_status)}</span></td>
              <td>${esc(e.graded_by || '\u2014')}</td>
              <td class="cell-sub">${fmtDate(e.graded_at)}</td>
              <td class="cell-sub" style="max-width:240px">${esc(e.qa_remarks || '\u2014')}</td>
            </tr>`).join('')}
          </tbody></table></div>` : emptyState('No QA grades yet', 'Once QA reviews your calls, scores will appear here.', 'shield')}
      </div>
    </div>
  </div>`;
}

/* ----- Closer: split queue ----- */
function viewCloserQueue() {
  const list = filterBySearch(state.leads);
  const mine = list.filter(x => x.is_own_closer_lead);
  const others = list.filter(x => !x.is_own_closer_lead);
  return `
  <div class="card">
    <div class="card-head">
      <div><h3>My Closer Leads</h3><div class="sub">Disposition controls enabled — these are booked with you</div></div>
    </div>
    <div class="card-pad">
      <div class="toolbar"><div class="search-wrap">${svg('search')}<input id="searchInput" placeholder="Search customer or phone" value="${esc(state.search)}"></div></div>
      ${leadsTable(mine, { showDisposition: true, showQa: true })}
      <div class="table-sub-head"><h3>${svg('users')} Other Closers \u2014 View Only</h3><span class="badge b-neutral">${others.length} lead${others.length === 1 ? '' : 's'}</span></div>
      ${others.length ? leadsTable(others, { readonly: true, showQa: true }) : emptyState('Nothing here', 'No other-closer leads are currently in the pipeline.', 'users')}
    </div>
  </div>`;
}

/* ----- Management/QA: All leads ----- */
function viewAllLeads() {
  const list = filterBySearch(state.leads);
  const r = role();
  return `
  <div class="card">
    <div class="card-head"><div><h3>Lead Queue</h3><div class="sub">${r === 'qa' ? 'Review calls and grade QA outcomes' : 'All operational leads \u2014 reassign closers as needed'}</div></div></div>
    <div class="card-pad">
      <div class="toolbar"><div class="search-wrap">${svg('search')}<input id="searchInput" placeholder="Search customer or phone" value="${esc(state.search)}"></div></div>
      ${leadsTable(list, { showAssign: true, showQa: true })}
    </div>
  </div>`;
}
function filterBySearch(list) {
  if (!state.search) return list;
  const q = state.search.toLowerCase();
  return list.filter(x => `${x.customer_name || ''} ${x.phone_number || ''}`.toLowerCase().includes(q));
}

function leadsTable(list, opts = {}) {
  if (!list.length) return emptyState('No leads here', 'This queue is empty right now.', 'target');
  const r = role();
  return `<div class="table-scroll"><table>
    <thead><tr><th>Customer</th><th>Fronter</th><th>Closer</th><th>Chase</th><th>Disposition</th>${opts.hideSla ? '' : '<th>SLA</th>'}<th></th></tr></thead>
    <tbody>${list.map(x => `
      <tr class="${opts.readonly ? 'readonly-row' : ''}">
        <td><div class="cell-name">${esc(x.customer_name)}${x.notes_count ? `<span class="note-badge" title="${x.notes_count} note${x.notes_count > 1 ? 's' : ''}">${svg('message', 'icon-inline')} ${x.notes_count}</span>` : ''}</div><div class="cell-sub">${esc(x.phone_number || '\u2014')} \u00b7 #${x.id}</div></td>
        <td>${esc(x.assigned_to_name || x.fronter_name || '\u2014')}</td>
        <td>${esc(x.closer_name || '\u2014')}</td>
        <td>${esc(x.chase_agent_name || '\u2014')}</td>
        <td>${statusBadge(x.status)}${x.qa_status ? `<div class="cell-sub">${svg('shield', 'icon-inline')} QA ${esc(x.qa_status)} \u00b7 ${x.qa_score ?? '-'}/100</div>` : ''}</td>
        ${opts.hideSla ? '' : `<td>${slaChip(x)}</td>`}
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-open="${x.id}">View</button>
          ${opts.showDisposition && x.is_own_closer_lead ? `<button class="btn btn-primary btn-sm" data-disposition="${x.id}">Disposition</button>` : ''}
          ${r === 'chase' && x.is_own_chase_lead ? `<button class="btn btn-primary btn-sm" data-chase="${x.id}">Update</button>` : ''}
          ${r === 'chase' && !x.chase_assigned_to && x.status === 'Customer Form Completed' ? `<button class="btn btn-soft btn-sm" data-claim="${x.id}">Claim</button>` : ''}
          ${opts.showAssign && isMgmt() ? `<button class="btn btn-soft btn-sm" data-assign="${x.id}">Reassign</button>` : ''}
          ${opts.showQa && canGradeQa() ? `<button class="btn btn-soft btn-sm" data-qa="${x.id}">Grade</button>` : ''}
        </div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* ----- Booking Slot Dashboard ----- */
async function loadSlotDashboard() {
  state.slotLoading = true; state.slotDashboard = null;
  renderView();
  try {
    state.slotDashboard = await api('/slots/dashboard');
  } catch (e) {
    toast(e.message, 'error');
    state.slotDashboard = { closers: [], weekdays: BOOKING_DAYS, slots: BOOKING_SLOTS, bookings: [] };
  } finally {
    state.slotLoading = false;
    if (state.view === 'slots') renderView();
  }
  if (isMgmt()) loadLiveAgents();
}
async function loadLiveAgents(silent) {
  if (!isMgmt()) return;
  if (!silent) state.liveAgentsLoading = true;
  if (!silent && state.view === 'slots') renderView();
  try {
    state.liveAgents = await api('/dashboard/live-agents');
  } catch (e) {
    if (!silent) toast(e.message, 'error');
  } finally {
    state.liveAgentsLoading = false;
    if (state.view === 'slots') renderView();
    if (state.tvMode) paintTvMode();
  }
}
function liveAgentsPanel() {
  if (!isMgmt()) return '';
  const d = state.liveAgents;
  if (state.liveAgentsLoading && !d) {
    return `<div class="card" style="margin-top:20px"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  }
  if (!d) return '';
  const rows = d.agents || [];
  return `
  <div class="card" style="margin-top:20px">
    <div class="card-head">
      <div><h3>${svg('sparkles')} Live Agent Performance</h3><div class="sub">Auto-refreshes every 20s \u2014 great for a TV or wallboard</div></div>
      <div class="row-actions">
        <span class="status-pulse"><i></i><span class="txt">Live</span></span>
        <button class="btn btn-soft btn-sm" id="tvModeBtn">${svg('grid')} Full View</button>
      </div>
    </div>
    <div class="card-pad">
      ${rows.length ? liveAgentsTable(rows) : emptyState('No fronters yet', 'Add fronter accounts from Team & Access.', 'users')}
    </div>
  </div>`;
}
function liveAgentsTable(rows, big) {
  const cellCls = big ? 'tabular' : 'tabular';
  return `<div class="table-scroll"><table class="${big ? 'tv-table' : ''}">
    <thead><tr><th>Agent</th><th>Daily Sent</th><th>Daily Completed</th><th>Weekly Sent</th><th>Weekly Completed</th></tr></thead>
    <tbody>${rows.map(a => `
      <tr>
        <td class="cell-name">${esc(a.name)}</td>
        <td class="${cellCls}">${a.dailySent}</td>
        <td class="${cellCls}" style="color:var(--good);font-weight:800">${a.dailyCompleted}</td>
        <td class="${cellCls}">${a.weeklySent}</td>
        <td class="${cellCls}" style="color:var(--good);font-weight:800">${a.weeklyCompleted}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}
function openTvMode() {
  state.tvMode = true;
  state.tvKpiPrev = { dailySent: 0, dailyCompleted: 0, weeklySent: 0, weeklyCompleted: 0 };
  renderTvMode();
  loadLiveAgents(true);
  state._tvInterval = setInterval(() => loadLiveAgents(true), 20000);
  state._tvClock = setInterval(() => { const el = document.getElementById('tvClock'); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
  document.addEventListener('keydown', tvEscHandler);
}
function tvEscHandler(e) { if (e.key === 'Escape') closeTvMode(); }
function closeTvMode() {
  state.tvMode = false;
  clearInterval(state._tvInterval);
  clearInterval(state._tvClock);
  document.removeEventListener('keydown', tvEscHandler);
  document.getElementById('tvModeRoot')?.remove();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
function renderTvMode() {
  document.getElementById('tvModeRoot')?.remove();
  const div = document.createElement('div');
  div.id = 'tvModeRoot';
  div.className = 'tv-mode';
  document.body.appendChild(div);
  paintTvMode();
  div.querySelector('#tvExit').addEventListener('click', closeTvMode);
  div.querySelector('#tvFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) div.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
}
function paintTvMode() {
  const div = document.getElementById('tvModeRoot');
  if (!div) return;
  const d = state.liveAgents;
  const rows = d?.agents || [];
  const t = d?.totals || {};
  if (!state.tvKpiPrev) state.tvKpiPrev = { dailySent: 0, dailyCompleted: 0, weeklySent: 0, weeklyCompleted: 0 };
  div.innerHTML = `
    <div class="tv-scanline"></div>
    <div class="tv-topbar">
      <div class="tv-brand"><img class="brand-logo-icon tv-logo-icon" src="/assets/voice-nation-logo.png" alt="Voice Nation BPO"><div><b>Voice Nation BPO</b><span><i></i>Golden Days &middot; Live Operations Wallboard</span></div><div class="gd-chip tv-gd-chip"><img src="/assets/golden-days-logo.png" alt="Golden Days"></div></div>
      <div class="tv-clock" id="tvClock">${new Date().toLocaleTimeString()}</div>
      <div class="tv-actions">
        <button class="btn btn-soft btn-sm" id="tvFullscreen">${svg('grid')} Fullscreen</button>
        <button class="btn btn-soft btn-sm" id="tvExit">${svg('x')} Exit</button>
      </div>
    </div>
    <div class="tv-kpis">
      ${tvKpi('Daily Sent', 'tvKpiDailySent')}
      ${tvKpi('Daily Completed', 'tvKpiDailyCompleted', true)}
      ${tvKpi('Weekly Sent', 'tvKpiWeeklySent')}
      ${tvKpi('Weekly Completed', 'tvKpiWeeklyCompleted', true)}
    </div>
    <div class="tv-table-wrap">${rows.length ? tvAgentsTable(rows) : emptyState('No data yet', '', 'users')}</div>
  `;
  div.querySelector('#tvExit').addEventListener('click', closeTvMode);
  div.querySelector('#tvFullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) div.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  ['dailySent', 'dailyCompleted', 'weeklySent', 'weeklyCompleted'].forEach(key => {
    const el = document.getElementById('tvKpi' + key[0].toUpperCase() + key.slice(1));
    const to = t[key] ?? 0;
    animateCountUp(el, state.tvKpiPrev[key] || 0, to);
    state.tvKpiPrev[key] = to;
  });
}
function tvKpi(label, elId, good) {
  return `<div class="tv-kpi"><div class="tv-kpi-label">${esc(label)}</div><div class="tv-kpi-value" id="${elId}" style="${good ? 'color:var(--good)' : ''}">0</div></div>`;
}
function tvAgentsTable(rows) {
  if (!rows.length) return emptyState('No data yet', '', 'users');
  const medal = i => i === 0 ? '<span class="tv-rank-medal gold">1</span>' : i === 1 ? '<span class="tv-rank-medal silver">2</span>' : i === 2 ? '<span class="tv-rank-medal bronze">3</span>' : '';
  const rankCls = i => i === 0 ? 'tv-rank-1' : i === 1 ? 'tv-rank-2' : i === 2 ? 'tv-rank-3' : '';
  return `<div class="table-scroll"><table class="tv-table">
    <thead><tr><th>Agent</th><th>Daily Sent</th><th>Daily Completed</th><th>Weekly Sent</th><th>Weekly Completed</th></tr></thead>
    <tbody>${rows.map((a, i) => `
      <tr class="${rankCls(i)}" style="animation-delay:${i * 0.06}s">
        <td class="cell-name">${medal(i)}${esc(a.name)}</td>
        <td>${a.dailySent}</td>
        <td style="color:var(--good);font-weight:800">${a.dailyCompleted}</td>
        <td>${a.weeklySent}</td>
        <td style="color:var(--good);font-weight:800">${a.weeklyCompleted}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}
function animateCountUp(el, from, to, duration = 700) {
  if (!el) return;
  if (from === to) { el.textContent = to; return; }
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = to;
  }
  requestAnimationFrame(step);
}
function viewSlots() {
  if (state.slotLoading || !state.slotDashboard) {
    return `<div class="hero-dash"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  }
  const d = state.slotDashboard;
  const closers = (d.closers && d.closers.length) ? d.closers : state.users.filter(u => normRole(u.role) === 'closer');
  const days = (d.weekdays && d.weekdays.length) ? d.weekdays : BOOKING_DAYS;
  const slots = (d.slots && d.slots.length) ? d.slots : BOOKING_SLOTS;
  const map = new Map();
  (d.bookings || []).forEach(b => map.set(`${b.closer_id}|${b.day_of_week}|${b.time_slot}`, b));
  const r = role();
  const canBook = r === 'fronter' || r === 'fronting';

  if (!state.slotsSelectedDay) state.slotsSelectedDay = nearestBookingDay(state.slotsSelectedDate);
  const activeDay = state.slotsSelectedDay;
  const selectedAgentId = state.slotsSelectedAgent;

  const dayCounts = {};
  days.forEach(dday => { dayCounts[dday] = (d.bookings || []).filter(b => b.day_of_week === dday).length; });

  const agentsToShow = selectedAgentId ? closers.filter(c => c.id === selectedAgentId) : closers;

  return `
  <div class="hero-dash">
    <div class="hero-topbar">
      <div class="hero-brand">
        <div class="hero-crest"><span class="crest-ring"></span><span class="crest-shape"></span><span class="crest-letter">VN</span></div>
        <div class="hero-title"><h2>Booking Command Center</h2><p>Live weekly schedule across every closer</p></div>
        <div class="gd-chip hero-gd-chip"><img src="/assets/golden-days-logo.png" alt="Golden Days"></div>
      </div>
      <div class="hero-datenav">
        <button type="button" id="datePrev" style="transform:scaleX(-1)">${svg('chev', 'icon-inline')}</button>
        <input type="date" id="dateInput" value="${esc(state.slotsSelectedDate)}">
        <button type="button" id="dateNext">${svg('chev', 'icon-inline')}</button>
        <button type="button" class="today-btn" id="dateToday">Today</button>
      </div>
    </div>

    <div class="hero-daytabs">
      ${days.map(dday => `
        <button type="button" class="hero-daytab ${dday === activeDay ? 'active' : ''}" data-day="${esc(dday)}">
          <span class="dtab-full">${esc(dday)}</span>
          <span class="dtab-count">${dayCounts[dday] || 0} booked</span>
        </button>`).join('')}
    </div>

    ${closers.length ? `
    <div class="hero-body">
      <div class="hero-agent-rail">
        <button type="button" class="hero-agent-card all-agents ${!selectedAgentId ? 'active' : ''}" data-agent="">
          <span class="ha-avatar">${svg('users', 'icon-inline')}</span>
          <div class="ha-info"><strong>All Agents</strong><span>${closers.length} closers</span></div>
          <span class="ha-badge">${dayCounts[activeDay] || 0}</span>
        </button>
        ${closers.map((c, i) => {
          const count = (d.bookings || []).filter(b => b.closer_id === c.id && b.day_of_week === activeDay).length;
          return `<button type="button" class="hero-agent-card tilt-card ${selectedAgentId === c.id ? 'active' : ''}" data-agent="${c.id}" style="animation-delay:${i * 0.05}s">
            <span class="ha-avatar">${esc(initials(c.full_name))}</span>
            <div class="ha-info"><strong>${esc(c.full_name)}</strong><span>Closer</span></div>
            <span class="ha-badge">${count}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="hero-timeline">
        ${slots.map((t, i) => `
          <div class="hero-slot-row" style="animation-delay:${i * 0.04}s">
            <div class="hero-slot-time">${esc(t)}<span>${esc(activeDay)}</span></div>
            <div class="hero-slot-chips">
              ${agentsToShow.map(c => {
                const b = map.get(`${c.id}|${activeDay}|${t}`);
                if (b) {
                  const done = b.status === 'Completed';
                  return `<button type="button" class="hero-chip ${done ? 'completed' : 'booked'}" data-open="${b.customer_id}">
                    <div class="hc-top"><span>${done ? 'DONE' : 'BOOKED'}</span></div>
                    <div class="hc-name">${esc(b.customer_name || 'Booked lead')}</div>
                    <div class="hc-sub">${esc(c.full_name)} \u00b7 ${esc(b.fronter_name || '\u2014')}</div>
                  </button>`;
                }
                return canBook
                  ? `<button type="button" class="hero-chip open clickable" data-book-closer="${c.id}" data-book-day="${esc(activeDay)}" data-book-time="${esc(t)}"><div class="hc-name">${esc(c.full_name)}</div><div class="hc-sub">Open \u2014 tap to book</div></button>`
                  : `<div class="hero-chip open"><div class="hc-name">${esc(c.full_name)}</div><div class="hc-sub">Open</div></div>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>
    ` : `<div style="position:relative;z-index:1">${emptyState('No closers configured', 'Add closer accounts from Team & Access to populate the schedule.', 'users')}</div>`}
  </div>
  ${liveAgentsPanel()}`;
}

/* ----- Chase Operations ----- */
function viewChase() {
  const active = state.leads.filter(x => ['Customer Form Completed', 'Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'].includes(x.status));
  const list = filterBySearch(active);
  const awaitingSend = active.filter(x => x.status === 'Customer Form Completed');
  const awaitingReturn = active.filter(x => x.status === 'Customer Form Sent');
  const received = active.filter(x => x.status === 'Customer Form Received');
  const notReceived = active.filter(x => x.status === 'Customer Form Not Received');
  const over = overdueLeads(active);
  return `
  <div class="grid" style="gap:18px">
    ${chaseTodoPanel()}
    <div class="grid grid-4">
      ${kpiCard({ label: 'Awaiting Send (24h)', value: awaitingSend.length, icon: 'clock', tone: 'warn', sub: 'Physical form not yet sent' })}
      ${kpiCard({ label: 'Awaiting Return (7d)', value: awaitingReturn.length, icon: 'clock', tone: 'ai', sub: 'Waiting on customer' })}
      ${kpiCard({ label: 'Form Received', value: received.length, icon: 'check', tone: 'good', sub: 'Chase stage complete' })}
      ${kpiCard({ label: 'Overdue', value: over.length, icon: 'alert', tone: over.length ? 'bad' : 'good', sub: 'Immediate action required' })}
    </div>
    ${notReceived.length ? `<div class="grid grid-4">${kpiCard({ label: 'Form Not Received', value: notReceived.length, icon: 'x', tone: 'bad', sub: 'Customer did not return the form' })}</div>` : ''}
    <div class="card">
      <div class="card-head"><div><h3>Chase SLA Queue</h3><div class="sub">24-hour send window, then a 7-day customer-return window</div></div></div>
      <div class="card-pad">
        <div class="toolbar"><div class="search-wrap">${svg('search')}<input id="searchInput" placeholder="Search customer or phone" value="${esc(state.search)}"></div></div>
        ${list.length ? chaseTable(list) : emptyState('Chase queue is empty', 'Leads will appear here once a closer marks Customer Form Completed.', 'clock')}
      </div>
    </div>
  </div>`;
}
async function loadChaseTodo(agentId) {
  state.chaseTodoLoading = true;
  if (['chase', 'intelligence'].includes(state.view)) renderView();
  try {
    const q = agentId ? `?agent_id=${agentId}` : '';
    state.chaseTodo = await api('/ai/chase-todo' + q);
  } catch (e) {
    state.chaseTodo = null;
  } finally {
    state.chaseTodoLoading = false;
    if (['chase', 'intelligence'].includes(state.view)) renderView();
  }
}
function chaseTodoPanel() {
  if (role() !== 'chase') return '';
  const d = state.chaseTodo;
  if (!d) return '';
  const todos = d.todos || [];
  return `
  <div class="card ai-hero">
    <div class="card-head"><div class="flex items-center gap-12"><span class="ai-glyph">${svg('sparkles')}</span><div><h3>My AI Todo List</h3><div class="sub">Prioritized by SLA urgency \u2014 refreshed automatically</div></div></div></div>
    <div class="card-pad">
      ${todos.length ? todos.map(t => `
        <div class="insight-card ${t.priority === 'urgent' ? 'todo-urgent' : t.priority === 'soon' ? 'todo-soon' : ''}">
          <span class="ic-icon">${svg(t.priority === 'urgent' ? 'alert' : 'clock')}</span>
          <div style="flex:1;min-width:0">
            <p style="margin:0">${esc(t.action)}</p>
            <button class="btn btn-ghost btn-sm" style="margin-top:6px;padding:4px 8px" data-open="${t.leadId}">Open lead ${svg('chev', 'icon-inline')}</button>
          </div>
        </div>`).join('') : emptyState('Nothing to do right now', 'New tasks will appear here as leads move through the pipeline.', 'check')}
    </div>
  </div>`;
}
function chaseTable(list) {
  const r = role();
  return `<div class="table-scroll"><table>
    <thead><tr><th>Customer</th><th>Stage</th><th>Timer</th><th>Assigned</th><th></th></tr></thead>
    <tbody>${list.map(x => `
      <tr>
        <td><div class="cell-name">${esc(x.customer_name)}${x.notes_count ? `<span class="note-badge" title="${x.notes_count} note${x.notes_count > 1 ? 's' : ''}">${svg('message', 'icon-inline')} ${x.notes_count}</span>` : ''}</div><div class="cell-sub">${esc(x.phone_number || '\u2014')} \u00b7 #${x.id}</div></td>
        <td>${statusBadge(x.status)}</td>
        <td><div class="sla-ring-wrap">${slaRing(x)}${slaChip(x)}</div></td>
        <td>${esc(x.chase_agent_name || 'Unassigned')}</td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-open="${x.id}">View</button>
          ${r === 'chase' && x.is_own_chase_lead ? `<button class="btn btn-primary btn-sm" data-chase="${x.id}">Update</button>` : ''}
          ${r === 'chase' && !x.chase_assigned_to && x.status === 'Customer Form Completed' ? `<button class="btn btn-soft btn-sm" data-claim="${x.id}">Claim</button>` : ''}
        </div></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* ----- AI Intelligence ----- */
function viewIntelligence() {
  if (state.aiLoading || !state.aiReport) {
    return `<div class="card"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  }
  const d = state.aiReport;
  const k = d.kpis || {};
  const healthTone = { Excellent: 'b-good', Healthy: 'b-good', 'At Risk': 'b-warn', Critical: 'b-bad' }[k.slaHealth] || 'b-neutral';
  return `
  <div class="grid" style="gap:18px">
    <div class="card hero ai-hero scale-in">
      <div class="flex items-center gap-12">
        <span class="ai-glyph">${svg('sparkles')}</span>
        <div>
          <span class="hero-eyebrow">${svg('reportAi')} AI Chase Report \u00b7 ${esc(d.scope || '')}</span>
          <h2 style="margin-bottom:2px">SLA health: <span class="badge ${healthTone}" style="font-size:14px;padding:5px 12px;vertical-align:middle">${esc(k.slaHealth || '\u2014')}</span></h2>
          <p>Generated ${fmtDateTime(d.generated_at)} from live disposition and SLA timestamps \u2014 no external calls, fully deterministic.</p>
        </div>
      </div>
    </div>
    <div class="grid grid-4">
      ${kpiCard({ label: 'Active in Chase', value: k.active ?? 0, icon: 'target', sub: `${k.awaitingSend ?? 0} awaiting send \u00b7 ${k.awaitingReturn ?? 0} awaiting return` })}
      ${kpiCard({ label: 'Overdue', value: k.overdue ?? 0, icon: 'alert', tone: (k.overdue ?? 0) ? 'bad' : 'good', sub: `${k.overdueRate ?? 0}% of active queue` })}
      ${kpiCard({ label: 'Send SLA Rate', value: (k.sendSlaRate ?? 0) + '%', icon: 'clock', tone: 'ai', sub: `Avg ${k.avgHoursToSend ?? 0}h to send` })}
      ${kpiCard({ label: 'Return Rate', value: (k.returnRate ?? 0) + '%', icon: 'check', tone: 'good', sub: `Avg ${k.avgDaysToReturn ?? 0}d to return` })}
    </div>
    <div class="grid split-main">
      <div class="card">
        <div class="card-head"><h3>Agent Performance</h3><span class="badge b-ai">${svg('sparkles')} Live</span></div>
        <div class="card-pad">${agentPerformanceTable(d.agentPerformance || [])}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>AI Findings</h3></div>
        <div class="card-pad">
          ${(d.recommendations || []).map(r => `<div class="insight-card"><span class="ic-icon">${svg('sparkles')}</span><p>${esc(r)}</p></div>`).join('') || emptyState('No findings', 'The pipeline is quiet right now.', 'sparkles')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Risk Leads</h3><div class="sub">Oldest overdue items, prioritized</div></div>
      <div class="card-pad">
        ${(d.riskLeads || []).length ? `<div class="metric-list">${d.riskLeads.map(rl => `
          <div class="risk-item">
            <span class="badge b-bad">${rl.overdue_hours}h over</span>
            <div style="flex:1;min-width:0"><div class="ri-name">${esc(rl.customer_name)} <span class="text-muted">#${rl.id}</span></div><div class="ri-sub">${esc(rl.status)} \u00b7 ${esc(rl.chase_agent_name)}</div></div>
            <button class="btn btn-ghost btn-sm" data-open="${rl.id}">View</button>
          </div>`).join('')}</div>` : emptyState('No risk leads', 'Nothing is currently overdue.', 'check')}
      </div>
    </div>
    ${isMgmt() ? mgmtChaseTodoPanel() : ''}
  </div>`;
}
function mgmtChaseTodoPanel() {
  const d = state.chaseTodo;
  if (!d) return '';
  const todos = d.todos || [];
  const byAgent = {};
  todos.forEach(t => { const k = t.chase_agent_name || 'Unassigned'; (byAgent[k] = byAgent[k] || []).push(t); });
  return `
  <div class="card ai-hero">
    <div class="card-head"><div class="flex items-center gap-12"><span class="ai-glyph">${svg('sparkles')}</span><div><h3>Chase Team AI Todo List</h3><div class="sub">Every agent's prioritized action list in one place</div></div></div></div>
    <div class="card-pad">
      ${Object.keys(byAgent).length ? Object.entries(byAgent).map(([agent, items]) => `
        <div class="table-sub-head"><h3>${esc(agent)}</h3><span class="badge b-neutral">${items.length}</span></div>
        ${items.map(t => `
          <div class="insight-card ${t.priority === 'urgent' ? 'todo-urgent' : t.priority === 'soon' ? 'todo-soon' : ''}">
            <span class="ic-icon">${svg(t.priority === 'urgent' ? 'alert' : 'clock')}</span>
            <div style="flex:1;min-width:0">
              <p style="margin:0">${esc(t.action)}</p>
              <button class="btn btn-ghost btn-sm" style="margin-top:6px;padding:4px 8px" data-open="${t.leadId}">Open lead ${svg('chev', 'icon-inline')}</button>
            </div>
          </div>`).join('')}
      `).join('') : emptyState('Nothing pending', 'The chase team is fully caught up.', 'check')}
    </div>
  </div>`;
}
function agentPerformanceTable(rows) {
  if (!rows.length) return emptyState('No agent data yet', 'Chase activity will populate this table.', 'users');
  const max = Math.max(1, ...rows.map(r => r.assigned));
  return `<div class="table-scroll"><table class="agent-table">
    <thead><tr><th>Agent</th><th>Load</th><th>Sent</th><th>Received</th><th>Overdue</th><th>Return Rate</th></tr></thead>
    <tbody>${rows.map(a => `
      <tr>
        <td class="cell-name">${esc(a.name)}</td>
        <td><div class="flex items-center gap-8"><div class="bar-track" style="width:70px"><i class="bar-fill" style="width:${a.assigned / max * 100}%"></i></div><span class="tabular">${a.assigned}</span></div></td>
        <td class="tabular">${a.sent}</td>
        <td class="tabular">${a.received}</td>
        <td>${a.overdue ? `<span class="badge b-bad">${a.overdue}</span>` : `<span class="badge b-good">0</span>`}</td>
        <td class="tabular">${a.returnRate}%</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}
async function loadAiReport() {
  state.aiLoading = true; state.aiReport = null;
  renderView();
  try {
    state.aiReport = await api('/ai/chase-report');
  } catch (e) {
    toast(e.message, 'error');
    state.aiReport = { kpis: {}, agentPerformance: [], riskLeads: [], recommendations: [] };
  } finally {
    state.aiLoading = false;
    if (state.view === 'intelligence') renderView();
  }
}

/* ----- Team & Access ----- */
function viewTeam() {
  const groups = { fronter: 'Fronters', closer: 'Closers', chase: 'Chase Agents', admin: 'Admins', superadmin: 'Super Admins', manager: 'Managers', qa: 'QA' };
  const byRole = {};
  state.users.forEach(u => { const r = normRole(u.role); (byRole[r] = byRole[r] || []).push(u); });
  return `
  <div class="grid" style="gap:18px">
    <div class="card">
      <div class="card-head"><div><h3>Team Directory</h3><div class="sub">${state.users.length} team members</div></div>
        <button class="btn btn-primary btn-sm" id="newUserBtn">${svg('plus')} Add User</button></div>
      <div class="card-pad">
        <div class="grid grid-3">
          ${Object.keys(groups).filter(k => byRole[k]?.length).map(k => `
            <div class="card" style="box-shadow:none">
              <div class="card-head" style="padding:16px 16px 0"><h3 style="font-size:13px">${esc(groups[k])}</h3><span class="badge b-neutral">${byRole[k].length}</span></div>
              <div class="card-pad" style="padding-top:10px">
                ${byRole[k].map(u => `
                  <div class="team-row">
                    <span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(u.full_name))}</span>
                    <div class="who"><strong>${esc(u.full_name)}</strong><span>${esc(u.email)}</span></div>
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm btn-icon" data-edit-user="${u.id}" title="Edit role">${svg('key')}</button>
                      <button class="btn btn-ghost btn-sm btn-icon" data-del-user="${u.id}" title="Remove">${svg('trash')}</button>
                    </div>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

/* ----- Reports ----- */
function viewReports() {
  const a = state.analytics;
  const rows = a.dispositionBreakdown || [];
  return `
  <div class="grid" style="gap:18px">
    <div class="grid grid-4">
      ${kpiCard({ label: 'Leads', value: a.totalLeads ?? state.leads.length, icon: 'target', sub: 'Current visible pipeline' })}
      ${kpiCard({ label: 'Completed', value: a.completedLeads ?? 0, icon: 'check', tone: 'good', sub: 'Closer handoff / won' })}
      ${kpiCard({ label: 'Completion Rate', value: (a.completionRate ?? '0.0') + '%', icon: 'bar', tone: 'ai', sub: 'Completed \u00f7 total' })}
      ${kpiCard({ label: 'Chase Overdue', value: a.chaseOverdue ?? overdueLeads(state.leads).length, icon: 'alert', tone: 'bad', sub: 'Requires action' })}
    </div>
    <div class="card">
      <div class="card-head"><h3>Disposition Breakdown</h3></div>
      <div class="card-pad chart-card">${dispositionBarChart(rows)}</div>
    </div>
  </div>`;
}

/* ----- Admin/Superadmin/Manager: Advanced Reporting ----- */
async function loadAdvancedReport(range) {
  state.advReportRange = range;
  state.advReportLoading = true;
  if (state.view === 'reports') renderView();
  try {
    const params = new URLSearchParams();
    if (range === 'custom') {
      params.set('start', state.advReportCustom.start);
      params.set('end', state.advReportCustom.end);
    } else if (range !== 'all') {
      params.set('range', range);
    }
    state.advReport = await api('/reports/overview?' + params.toString());
  } catch (e) {
    toast(e.message, 'error');
    state.advReport = null;
  } finally {
    state.advReportLoading = false;
    if (state.view === 'reports') renderView();
  }
}
function exportUrl(status) {
  const params = new URLSearchParams();
  const range = state.advReportRange;
  if (range === 'custom') {
    params.set('start', state.advReportCustom.start);
    params.set('end', state.advReportCustom.end);
  } else if (range !== 'all') {
    params.set('range', range);
  }
  if (status) params.set('status', status);
  return `${API}/reports/export?${params.toString()}`;
}
async function downloadReport(status) {
  try {
    const res = await fetch(exportUrl(status), { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Export failed'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = status ? `report_${status.replace(/[^a-z0-9]+/gi, '_')}.csv` : 'report_all_leads.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Report downloaded', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
function viewReportsAdvanced() {
  const ranges = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['all', 'All Time'], ['custom', 'Custom']];
  const rangeToolbar = `
    <div class="toolbar" style="margin-bottom:16px">
      ${ranges.map(([k, l]) => `<button class="btn btn-sm ${state.advReportRange === k ? 'btn-primary' : 'btn-soft'}" data-range="${k}">${l}</button>`).join('')}
      ${state.advReportRange === 'custom' ? `
        <input type="date" id="advStart" value="${esc(state.advReportCustom.start)}" style="max-width:160px">
        <span class="text-muted">to</span>
        <input type="date" id="advEnd" value="${esc(state.advReportCustom.end)}" style="max-width:160px">
        <button class="btn btn-soft btn-sm" id="advCustomApply">Apply</button>
      ` : ''}
      <button class="btn btn-soft btn-sm" id="downloadFullBtn" style="margin-left:auto">${svg('filePlus')} Download Full Report (CSV)</button>
    </div>`;

  if (state.advReportLoading || !state.advReport) {
    return rangeToolbar + `<div class="card"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  }
  const d = state.advReport;
  const t = d.totals;

  return rangeToolbar + `
  <div class="grid" style="gap:18px">
    <div class="grid grid-4">
      ${kpiCard({ label: 'Total Leads', value: t.leads, icon: 'target', sub: `${fmtDate(d.range.start)} \u2192 ${fmtDate(d.range.end)}` })}
      ${kpiCard({ label: 'Completed / Won', value: `${t.completed} / ${t.won}`, icon: 'check', tone: 'good', sub: `${t.completionRate}% completion \u00b7 ${t.conversionRate}% won` })}
      ${kpiCard({ label: 'Chase Overdue', value: t.chaseOverdue, icon: 'alert', tone: t.chaseOverdue ? 'bad' : 'good', sub: 'SLA breaches in range' })}
      ${kpiCard({ label: 'Avg QA Score', value: t.avgQaScore != null ? t.avgQaScore + '/100' : '\u2014', icon: 'shield', tone: t.avgQaScore != null && t.avgQaScore < 75 ? 'bad' : 'good', sub: t.qaPassRate != null ? `${t.qaPassRate}% pass rate \u00b7 ${t.qaGradedCount} graded` : 'No grades yet' })}
    </div>

    <div class="card ai-hero">
      <div class="card-head"><div class="flex items-center gap-12"><span class="ai-glyph">${svg('sparkles')}</span><div><h3>AI Executive Summary</h3><div class="sub">Deterministic, rule-based analysis of the selected range</div></div></div></div>
      <div class="card-pad">${d.recommendations.map(r => `<div class="insight-card"><span class="ic-icon">${svg('sparkles')}</span><p>${esc(r)}</p></div>`).join('')}</div>
    </div>

    <div class="grid split-main">
      <div class="card">
        <div class="card-head"><h3>Lead Volume Trend</h3></div>
        <div class="card-pad chart-card">${trendChart(d.dailyTrend)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Pipeline Funnel</h3></div>
        <div class="card-pad chart-card">${funnelChart(d.funnel)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Disposition Breakdown</h3><span class="badge b-neutral">${d.dispositionBreakdown.length} outcome${d.dispositionBreakdown.length === 1 ? '' : 's'}</span></div>
      <div class="card-pad">
        <div class="table-scroll"><table>
          <thead><tr><th>Disposition</th><th>Count</th><th>Share</th><th></th></tr></thead>
          <tbody>${d.dispositionBreakdown.map(r => `
            <tr>
              <td>${statusBadge(r.status)}</td>
              <td class="tabular">${r.count}</td>
              <td><div class="flex items-center gap-8"><div class="bar-track" style="width:120px"><i class="bar-fill" style="width:${r.percentage}%"></i></div><span class="tabular">${r.percentage}%</span></div></td>
              <td><button class="btn btn-ghost btn-sm" data-export-status="${esc(r.status)}">${svg('filePlus')} CSV</button></td>
            </tr>`).join('')}
          </tbody></table></div>
      </div>
    </div>

    <div class="grid grid-3">
      <div class="card">
        <div class="card-head"><h3>Fronter Performance</h3></div>
        <div class="card-pad">${performanceTable(d.fronterPerformance)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Closer Performance</h3></div>
        <div class="card-pad">${performanceTable(d.closerPerformance)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Chase Performance</h3></div>
        <div class="card-pad">${chasePerformanceTable(d.chasePerformance)}</div>
      </div>
    </div>
  </div>`;
}
function performanceTable(rows) {
  if (!rows || !rows.length) return emptyState('No data', 'No activity in this range yet.', 'users');
  return `<div class="metric-list">${rows.slice(0, 10).map(r => `
    <div class="metric-row">
      <span class="m-label">${esc(r.name)}</span>
      <div class="flex items-center gap-8" style="flex:1;justify-content:flex-end">
        <span class="tabular text-muted" style="font-size:11.5px">${r.completed}/${r.total}</span>
        <div class="bar-track" style="max-width:80px"><i class="bar-fill" style="width:${r.completionRate}%"></i></div>
        <span class="tabular" style="width:38px;text-align:right">${r.completionRate}%</span>
      </div>
    </div>`).join('')}</div>`;
}
function chasePerformanceTable(rows) {
  if (!rows || !rows.length) return emptyState('No data', 'No chase activity in this range yet.', 'clock');
  return `<div class="metric-list">${rows.slice(0, 10).map(r => `
    <div class="metric-row">
      <span class="m-label">${esc(r.name)}</span>
      <span class="tabular" style="font-size:11.5px">${r.sent} sent \u00b7 ${r.received} recv \u00b7 ${r.overdue ? `<span style="color:var(--bad)">${r.overdue} overdue</span>` : '0 overdue'}</span>
    </div>`).join('')}</div>`;
}
function dispositionBarChart(rows) {
  if (!rows.length) return emptyState('No data yet', 'Reports populate once leads move through the pipeline.', 'bar');
  const w = 640, barH = 26, gap = 14, padL = 210, padR = 60, h = rows.length * (barH + gap) + gap;
  const max = Math.max(1, ...rows.map(r => r.count));
  const colors = ['var(--accent)', 'var(--accent-2)', 'var(--info)', 'var(--good)', 'var(--warn)', 'var(--bad)', 'var(--muted)', 'var(--text-dim)'];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">
    ${rows.slice(0, 8).map((r, i) => {
      const y = gap + i * (barH + gap);
      const bw = (r.count / max) * (w - padL - padR);
      return `<text x="${padL - 12}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="var(--text-dim)" font-family="Inter">${esc(r.status.length > 26 ? r.status.slice(0, 24) + '\u2026' : r.status)}</text>
      <rect x="${padL}" y="${y}" width="${w - padL - padR}" height="${barH}" rx="6" fill="var(--surface-2)"/>
      <rect x="${padL}" y="${y}" width="${Math.max(2, bw)}" height="${barH}" rx="6" fill="${colors[i % colors.length]}"/>
      <text x="${padL + Math.max(2, bw) + 10}" y="${y + barH / 2 + 4}" font-size="12" font-weight="700" fill="var(--text)" font-family="JetBrains Mono">${r.count}${r.percentage !== undefined ? ' \u00b7 ' + r.percentage + '%' : ''}</text>`;
    }).join('')}
  </svg>`;
}
function trendChart(rows) {
  if (!rows || !rows.length) return emptyState('No trend data yet', 'Daily activity will chart here once leads come in.', 'bar');
  const w = 720, h = 220, padL = 40, padR = 20, padT = 16, padB = 30;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const max = Math.max(1, ...rows.map(r => r.leads));
  const stepX = rows.length > 1 ? innerW / (rows.length - 1) : 0;
  const pt = (i, v) => [padL + i * stepX, padT + innerH - (v / max) * innerH];
  const leadsPts = rows.map((r, i) => pt(i, r.leads));
  const completedPts = rows.map((r, i) => pt(i, r.completed));
  const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${toPath(leadsPts)} L${leadsPts[leadsPts.length - 1][0].toFixed(1)},${padT + innerH} L${leadsPts[0][0].toFixed(1)},${padT + innerH} Z`;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">
    ${[0, 0.5, 1].map(f => `<line x1="${padL}" x2="${w - padR}" y1="${padT + innerH * (1 - f)}" y2="${padT + innerH * (1 - f)}" stroke="var(--border)" stroke-width="1"/>`).join('')}
    <path d="${areaPath}" fill="var(--accent)" opacity="0.12"/>
    <path d="${toPath(leadsPts)}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${toPath(completedPts)}" fill="none" stroke="var(--good)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4"/>
    ${leadsPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--accent)"/>`).join('')}
    ${completedPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--good)"/>`).join('')}
    ${rows.map((r, i) => i % labelEvery === 0 ? `<text x="${padL + i * stepX}" y="${h - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="Inter">${esc(r.date.slice(5))}</text>` : '').join('')}
    <rect x="${w - 150}" y="4" width="10" height="10" rx="2" fill="var(--accent)"/><text x="${w - 136}" y="13" font-size="11" fill="var(--text-dim)" font-family="Inter">Leads</text>
    <rect x="${w - 80}" y="4" width="10" height="10" rx="2" fill="var(--good)"/><text x="${w - 66}" y="13" font-size="11" fill="var(--text-dim)" font-family="Inter">Completed</text>
  </svg>`;
}
function funnelChart(stages) {
  if (!stages || !stages.length) return emptyState('No funnel data yet', 'Pipeline stages will appear here.', 'bar');
  const w = 640, rowH = 44, gap = 10, h = stages.length * (rowH + gap);
  const max = Math.max(1, stages[0].count);
  const colors = ['var(--accent)', 'var(--accent-2)', 'var(--info)', 'var(--good)'];
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">
    ${stages.map((s, i) => {
      const y = i * (rowH + gap);
      const pct = s.count / max;
      const bw = Math.max(30, pct * w);
      const x = (w - bw) / 2;
      const dropoff = i > 0 && stages[i - 1].count > 0 ? Math.round((1 - s.count / stages[i - 1].count) * 100) : 0;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${rowH}" rx="10" fill="${colors[i % colors.length]}" opacity="0.85"/>
      <text x="${w / 2}" y="${y + rowH / 2 - 4}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#fff" font-family="Manrope">${esc(s.stage)}</text>
      <text x="${w / 2}" y="${y + rowH / 2 + 12}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.85)" font-family="JetBrains Mono">${s.count}${i > 0 ? ` \u00b7 -${dropoff}%` : ''}</text>`;
    }).join('')}
  </svg>`;
}

/* ---------------------------------------------------------------------- */
/* Modals / drawers                                                        */
/* ---------------------------------------------------------------------- */
function closeOverlay() { document.getElementById('overlayRoot')?.remove(); }
function openOverlay(html, { onMount } = {}) {
  closeOverlay();
  const div = document.createElement('div');
  div.id = 'overlayRoot';
  div.innerHTML = html;
  document.body.appendChild(div);
  div.querySelector('.overlay').addEventListener('click', e => { if (e.target.classList.contains('overlay')) closeOverlay(); });
  div.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeOverlay));
  if (onMount) onMount(div);
}

function wireDynamicHandlers() {
  document.getElementById('searchInput')?.addEventListener('input', e => { state.search = e.target.value; renderView(); });
  document.getElementById('newLeadBtn')?.addEventListener('click', () => openNewLeadModal());
  document.getElementById('newUserBtn')?.addEventListener('click', openNewUserModal);
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => go(b.dataset.goto)));
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openLeadDrawer(Number(b.dataset.open))));
  document.querySelectorAll('[data-disposition]').forEach(b => b.addEventListener('click', () => openDispositionModal(Number(b.dataset.disposition))));
  document.querySelectorAll('[data-chase]').forEach(b => b.addEventListener('click', () => openChaseModal(Number(b.dataset.chase))));
  document.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => claimChase(Number(b.dataset.claim))));
  document.querySelectorAll('[data-qa]').forEach(b => b.addEventListener('click', () => openQaModal(Number(b.dataset.qa))));
  document.querySelectorAll('[data-assign]').forEach(b => b.addEventListener('click', () => openAssignModal(Number(b.dataset.assign))));
  document.querySelectorAll('[data-edit-user]').forEach(b => b.addEventListener('click', () => openEditUserModal(Number(b.dataset.editUser))));
  document.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', () => deleteUser(Number(b.dataset.delUser))));
  document.querySelectorAll('[data-book-closer]').forEach(b => b.addEventListener('click', () => openNewLeadModal({ closerId: Number(b.dataset.bookCloser), day: b.dataset.bookDay, time: b.dataset.bookTime })));
  document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => loadMyReports(b.dataset.period)));
  document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => loadAdvancedReport(b.dataset.range)));
  document.getElementById('advCustomApply')?.addEventListener('click', () => {
    state.advReportCustom.start = document.getElementById('advStart').value;
    state.advReportCustom.end = document.getElementById('advEnd').value;
    if (!state.advReportCustom.start || !state.advReportCustom.end) { toast('Pick both a start and end date', 'error'); return; }
    loadAdvancedReport('custom');
  });
  document.getElementById('downloadFullBtn')?.addEventListener('click', () => downloadReport());
  document.querySelectorAll('[data-export-status]').forEach(b => b.addEventListener('click', () => downloadReport(b.dataset.exportStatus)));

  // Booking Command Center
  document.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { state.slotsSelectedDay = b.dataset.day; renderView(); }));
  document.querySelectorAll('[data-agent]').forEach(b => b.addEventListener('click', () => { state.slotsSelectedAgent = b.dataset.agent ? Number(b.dataset.agent) : null; renderView(); }));
  document.getElementById('dateInput')?.addEventListener('change', e => {
    state.slotsSelectedDate = e.target.value;
    state.slotsSelectedDay = nearestBookingDay(e.target.value);
    renderView();
  });
  document.getElementById('dateToday')?.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    state.slotsSelectedDate = today;
    state.slotsSelectedDay = nearestBookingDay(today);
    renderView();
  });
  document.getElementById('datePrev')?.addEventListener('click', () => shiftSlotsDate(-1));
  document.getElementById('dateNext')?.addEventListener('click', () => shiftSlotsDate(1));
  document.getElementById('tvModeBtn')?.addEventListener('click', () => openTvMode());
  initTiltCards();
}
function shiftSlotsDate(delta) {
  const d = new Date(state.slotsSelectedDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  state.slotsSelectedDate = d.toISOString().slice(0, 10);
  state.slotsSelectedDay = nearestBookingDay(state.slotsSelectedDate);
  renderView();
}
function initTiltCards() {
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(500px) rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateY(-1px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ----- Lead detail drawer ----- */
async function openLeadDrawer(id) {
  openOverlay(`<div class="overlay right"><div class="drawer-panel scale-in"><div class="drawer-head"><div><h3>Lead #${id}</h3><p>Loading\u2026</p></div><button class="icon-btn" data-close>${svg('x')}</button></div><div class="drawer-body"><div class="spinner-wrap"><div class="spinner"></div></div></div></div></div>`);
  try {
    const x = await api('/customers/' + id);
    renderLeadDrawerBody(x);
  } catch (e) { toast(e.message, 'error'); closeOverlay(); }
}
function renderLeadDrawerBody(x) {
  const body = document.querySelector('#overlayRoot .drawer-body');
  const head = document.querySelector('#overlayRoot .drawer-head p');
  if (head) head.textContent = x.customer_name;
  if (!body) return;
  const fronterRole = isFronterRole();
  const showNotes = canSeeNotes();
  const showQaGrade = canGradeQa();

  body.innerHTML = `
    <div class="metric-list">
      <div class="metric-row"><span class="m-label">Phone</span><span class="m-val">${esc(x.phone_number || '\u2014')}</span></div>
      <div class="metric-row"><span class="m-label">Date of Birth</span><span class="m-val">${esc(x.date_of_birth || '\u2014')}</span></div>
      <div class="metric-row"><span class="m-label">Fronter</span><span class="m-val">${esc(x.fronter_name || '\u2014')}</span></div>
      <div class="metric-row"><span class="m-label">Closer</span><span class="m-val">${esc(x.closer_name || '\u2014')}</span></div>
      ${fronterRole ? '' : `<div class="metric-row"><span class="m-label">Chase Agent</span><span class="m-val">${esc(x.chase_agent_name || '\u2014')}</span></div>`}
      <div class="metric-row"><span class="m-label">Booking</span><span class="m-val">${esc(x.booking_day || '\u2014')} ${esc(x.booking_time || '')}</span></div>
      <div class="metric-row"><span class="m-label">Disposition</span>${statusBadge(x.status)}</div>
      ${fronterRole ? '' : `<div class="metric-row"><span class="m-label">SLA</span>${slaChip(x)}</div>`}
    </div>
    ${fronterRole ? `<div class="notice" style="margin-top:14px">${svg('info')} Visibility is locked at Customer Form Completed. Chase-team activity on this lead isn't shown here.</div>` : ''}

    ${(x.qa_score != null || showQaGrade) ? `
    <div class="table-sub-head"><h3>${svg('shield')} QA Review</h3>${showQaGrade ? `<button class="btn btn-soft btn-sm" id="drawerGradeBtn" style="margin-left:auto">${x.qa_score != null ? 'Update Grade' : 'Grade Call'}</button>` : ''}</div>
    ${x.qa_score != null ? `
      <div class="metric-list">
        <div class="metric-row"><span class="m-label">Score</span><span class="m-val">${x.qa_score}/100</span></div>
        <div class="metric-row"><span class="m-label">Outcome</span><span class="badge ${x.qa_status === 'Pass' ? 'b-good' : 'b-bad'}">${esc(x.qa_status || '\u2014')}</span></div>
        ${x.qa_graded_by ? `<div class="metric-row"><span class="m-label">Graded by</span><span class="m-val">${esc(x.qa_graded_by)}</span></div>` : ''}
      </div>
      ${x.qa_remarks ? `<p class="text-muted" style="font-size:13px;line-height:1.6;margin-top:8px">${esc(x.qa_remarks)}</p>` : ''}
    ` : `<p class="text-muted" style="font-size:12.5px">Not graded yet.</p>`}
    ` : ''}

    <div class="table-sub-head"><h3>Timeline</h3></div>
    <div class="metric-list">
      <div class="metric-row"><span class="m-label">Lead created</span><span class="m-val">${fmtDateTime(x.created_at)}</span></div>
      ${x.chase_assigned_at ? `<div class="metric-row"><span class="m-label">Sent to chase</span><span class="m-val">${fmtDateTime(x.chase_assigned_at)}</span></div>` : ''}
      ${x.chase_due_at ? `<div class="metric-row"><span class="m-label">24h send due</span><span class="m-val">${fmtDateTime(x.chase_due_at)}</span></div>` : ''}
      ${x.chase_form_sent_at ? `<div class="metric-row"><span class="m-label">Form sent</span><span class="m-val">${fmtDateTime(x.chase_form_sent_at)}</span></div>` : ''}
      ${x.chase_return_due_at ? `<div class="metric-row"><span class="m-label">7d return due</span><span class="m-val">${fmtDateTime(x.chase_return_due_at)}</span></div>` : ''}
      ${x.chase_form_received_at ? `<div class="metric-row"><span class="m-label">Form received</span><span class="m-val">${fmtDateTime(x.chase_form_received_at)}</span></div>` : ''}
      ${x.chase_form_not_received_at ? `<div class="metric-row"><span class="m-label">Marked not received</span><span class="m-val">${fmtDateTime(x.chase_form_not_received_at)}</span></div>` : ''}
    </div>
    ${x.notes ? `<div class="table-sub-head"><h3>Submission Notes</h3></div><p class="text-muted" style="font-size:13px;line-height:1.6">${esc(x.notes)}</p>` : ''}

    ${showNotes ? `
    <div class="table-sub-head"><h3>${svg('phone')} Call Log</h3><span class="badge b-neutral">${(x.call_log || []).length}</span></div>
    ${renderCallLog(x.call_log || [])}
    ` : ''}

    ${showNotes ? `
    <div class="table-sub-head"><h3>${svg('users')} Internal Notes</h3><span class="badge b-neutral">${(x.notes_thread || []).length}</span></div>
    <div id="notesThread">${renderNotesThread(x.notes_thread || [])}</div>
    <div class="field" style="margin-top:12px">
      <textarea id="newNoteText" rows="3" placeholder="Add a note visible to closer, chase, and management\u2026"></textarea>
    </div>
    <button class="btn btn-primary btn-sm" id="addNoteBtn">${svg('plus')} Add Note</button>
    ` : ''}
  `;

  const gradeBtn = body.querySelector('#drawerGradeBtn');
  if (gradeBtn) gradeBtn.addEventListener('click', () => openQaModal(x.id));

  const addNoteBtn = body.querySelector('#addNoteBtn');
  if (addNoteBtn) addNoteBtn.addEventListener('click', async () => {
    const ta = body.querySelector('#newNoteText');
    const text = ta.value.trim();
    if (!text) { toast('Write a note before saving', 'error'); return; }
    try {
      await api(`/customers/${x.id}/notes`, { method: 'POST', body: JSON.stringify({ note: text }) });
      const updated = await api('/customers/' + x.id);
      renderLeadDrawerBody(updated);
      toast('Note added', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}
function renderCallLog(logs) {
  if (!logs.length) return emptyState('No calls logged yet', 'Chase call attempts will show here with date, time and outcome.', 'phone');
  const toneClass = o => ({ 'Form Sent': 'outcome-sent', 'Form Not Sent': 'outcome-notsent', 'Form Received': 'outcome-received', 'Form Not Received': 'outcome-notreceived' }[o] || '');
  return logs.map(c => `
    <div class="call-entry ${toneClass(c.outcome)}">
      <span class="ce-icon">${svg('phone')}</span>
      <div class="ce-body">
        <div class="ce-top">
          <span class="ce-outcome">${esc(c.outcome)}</span>
          <span class="ce-meta">${esc(c.call_date)} ${esc(c.call_time)} \u00b7 ${esc(c.call_day || '')}</span>
        </div>
        <p>${esc(c.note)} <span class="text-muted">\u2014 ${esc(c.agent_name || 'Chase agent')}</span></p>
      </div>
    </div>`).join('');
}
function renderNotesThread(notes) {
  if (!notes.length) return emptyState('No notes yet', 'Be the first to leave context for the team.', 'users');
  return notes.map(n => `
    <div class="insight-card">
      <span class="ic-icon">${svg('users')}</span>
      <div style="min-width:0;flex:1">
        <div class="flex items-center gap-8" style="flex-wrap:wrap">
          <strong style="font-size:12.5px">${esc(n.author_name || 'Unknown')}</strong>
          <span class="role-chip role-${normRole(n.author_role).replace('_', '')}">${esc(normRole(n.author_role))}</span>
          <span class="text-muted" style="font-size:11px">${fmtDateTime(n.created_at)}</span>
        </div>
        <p style="margin-top:4px">${esc(n.note)}</p>
      </div>
    </div>`).join('');
}

/* ----- Closer disposition modal ----- */
function openDispositionModal(id) {
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>Set Disposition</h3><p>Lead #${id} \u2014 this becomes the customer's outcome</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      <div class="notice">${svg('info')} Selecting "Customer Form Completed" hands this lead to Chase with a 24-hour send SLA.</div>
      <div class="disposition-grid">
        ${CLOSER_STATUSES.map(s => `<button class="disposition-opt" data-set="${esc(s)}"><span class="dot"></span>${esc(s)}</button>`).join('')}
      </div>
    </div>
    <div class="modal-foot" style="display:none"></div>
  </div></div>`, {
    onMount: div => div.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', async () => {
      const status = b.dataset.set;
      if (status === 'Customer Form Completed') { renderChaseAssignStep(div, id); return; }
      try { await api(`/customers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); closeOverlay(); toast('Disposition saved', 'success'); refresh(); }
      catch (e) { toast(e.message, 'error'); }
    }))
  });
}
function renderChaseAssignStep(div, id) {
  const chaseAgents = state.users.filter(u => normRole(u.role) === 'chase');
  const body = div.querySelector('.modal-body');
  const foot = div.querySelector('.modal-foot');
  body.innerHTML = `
    <div class="notice">${svg('sparkles')} Choose which chase agent should receive this lead \u2014 it lands directly in their queue with a 24-hour send SLA.</div>
    ${chaseAgents.length ? `<div class="field"><label>Chase Agent</label>
      <select id="chaseAgentSelect">
        <option value="">Auto-assign (least busy)</option>
        ${chaseAgents.map(c => `<option value="${c.id}">${esc(c.full_name)}</option>`).join('')}
      </select>
    </div>` : `<div class="notice">${svg('info')} No chase agents are configured yet \u2014 this lead will be auto-assigned once one is added.</div>`}
  `;
  foot.style.display = 'flex';
  foot.innerHTML = `<button class="btn btn-soft" id="backBtn">Back</button><button class="btn btn-primary" id="confirmComplete">Confirm &amp; Send to Chase</button>`;
  foot.querySelector('#backBtn').addEventListener('click', () => openDispositionModal(id));
  foot.querySelector('#confirmComplete').addEventListener('click', async () => {
    const sel = div.querySelector('#chaseAgentSelect');
    const chaseId = sel ? sel.value : '';
    try {
      await api(`/customers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Customer Form Completed', ...(chaseId ? { chase_agent_id: Number(chaseId) } : {}) }) });
      closeOverlay(); toast('Lead completed and sent to chase', 'success'); refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ----- Chase update modal ----- */
function openChaseModal(id) {
  const lead = state.leads.find(x => x.id === id);
  let outcomes = [];
  if (!lead || lead.status === 'Customer Form Completed') {
    outcomes = [
      { value: 'Form Sent', label: 'Customer Call \u2014 Form Sent', desc: 'Called the customer and the physical form was sent' },
      { value: 'Form Not Sent', label: 'Customer Call \u2014 Form Not Sent', desc: 'Called the customer but the form was not sent this time' }
    ];
  } else {
    outcomes = [
      { value: 'Form Received', label: 'Customer Form Received', desc: 'Customer returned the completed form' },
      { value: 'Form Not Received', label: 'Customer Form Not Received', desc: 'Form has not come back from the customer' }
    ];
  }
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  openOverlay(`<div class="overlay center"><div class="modal wide scale-in">
    <div class="modal-head"><div><h3>Log Call</h3><p>Lead #${id}${lead ? ' \u2014 ' + esc(lead.customer_name) : ''} \u2014 date, time and a note are required</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      ${lead ? `<div class="notice">${svg('clock')} Current SLA: ${slaState(lead).state === 'overdue' ? 'OVERDUE' : slaState(lead).label}</div>` : ''}
      <div class="disposition-grid" id="outcomeGrid">
        ${outcomes.map((o, i) => `<button type="button" class="disposition-opt ${i === 0 ? 'selected' : ''}" data-outcome="${o.value}"><span class="dot"></span><div><div>${esc(o.label)}</div><div class="text-muted" style="font-weight:500;font-size:11.5px">${esc(o.desc)}</div></div></button>`).join('')}
      </div>
      <div class="form-grid" style="margin-top:16px">
        <div class="field"><label>Call Date</label><input id="callDate" type="date" value="${todayStr}"></div>
        <div class="field"><label>Call Time</label><input id="callTime" type="time" value="${timeStr}"></div>
        <div class="field full"><button class="btn btn-soft btn-sm" id="callNowBtn" type="button">${svg('clock')} Use current date &amp; time</button></div>
        <div class="field full"><label>Note (required)</label><textarea id="callNote" rows="3" placeholder="What happened on the call\u2026"></textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="logCallBtn">Save Call Log</button></div>
  </div></div>`, {
    onMount: div => {
      let selected = outcomes[0].value;
      div.querySelectorAll('[data-outcome]').forEach(b => b.addEventListener('click', () => {
        selected = b.dataset.outcome;
        div.querySelectorAll('[data-outcome]').forEach(x => x.classList.toggle('selected', x === b));
      }));
      div.querySelector('#callNowBtn').addEventListener('click', () => {
        const n = new Date();
        div.querySelector('#callDate').value = n.toISOString().slice(0, 10);
        div.querySelector('#callTime').value = n.toTimeString().slice(0, 5);
      });
      div.querySelector('#logCallBtn').addEventListener('click', async () => {
        const call_date = div.querySelector('#callDate').value;
        const call_time = div.querySelector('#callTime').value;
        const note = div.querySelector('#callNote').value.trim();
        if (!call_date || !call_time) { toast('Call date and time are required', 'error'); return; }
        if (!note) { toast('A note is required for every call log entry', 'error'); return; }
        try {
          await api(`/customers/${id}/chase-call`, { method: 'POST', body: JSON.stringify({ outcome: selected, call_date, call_time, note }) });
          closeOverlay(); toast('Call logged', 'success'); refresh();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  });
}
async function claimChase(id) {
  try { await api(`/customers/${id}/claim-chase`, { method: 'PATCH' }); toast('Lead claimed', 'success'); refresh(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ----- QA grading modal ----- */
function openQaModal(id) {
  const lead = state.leads.find(x => x.id === id);
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>Grade Call</h3><p>Lead #${id}${lead ? ' \u2014 ' + esc(lead.customer_name) : ''}</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      ${lead && lead.qa_score != null ? `<div class="notice">${svg('info')} Previously graded ${lead.qa_score}/100 \u00b7 ${esc(lead.qa_status)} by ${esc(lead.qa_graded_by || 'QA')}. Submitting again will overwrite this.</div>` : ''}
      <div class="form-grid">
        <div class="field"><label>Score (0\u2013100)</label><input id="qa_score" type="number" min="0" max="100" value="${lead && lead.qa_score != null ? lead.qa_score : ''}" placeholder="e.g. 88"></div>
        <div class="field"><label>Outcome</label><select id="qa_status">
          <option value="Pass" ${lead && lead.qa_status === 'Pass' ? 'selected' : ''}>Pass</option>
          <option value="Fail" ${lead && lead.qa_status === 'Fail' ? 'selected' : ''}>Fail</option>
        </select></div>
        <div class="field full"><label>Remarks</label><textarea id="qa_remarks" rows="4" placeholder="Compliance notes, coaching points\u2026">${esc(lead && lead.qa_remarks ? lead.qa_remarks : '')}</textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="qaSubmit">Save Grade</button></div>
  </div></div>`, {
    onMount: div => div.querySelector('#qaSubmit').addEventListener('click', async () => {
      const g = qid => div.querySelector('#' + qid);
      const score = Number(g('qa_score').value);
      if (!Number.isInteger(score) || score < 0 || score > 100) { toast('Score must be a whole number between 0 and 100', 'error'); return; }
      try {
        await api(`/customers/${id}/qa`, { method: 'PATCH', body: JSON.stringify({ qa_score: score, qa_status: g('qa_status').value, qa_remarks: g('qa_remarks').value }) });
        closeOverlay(); toast('QA grade saved', 'success'); refresh();
      } catch (e) { toast(e.message, 'error'); }
    })
  });
}

/* ----- Reassign closer modal (admin/superadmin) ----- */
function openAssignModal(id) {
  const closers = state.users.filter(u => normRole(u.role) === 'closer');
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>Reassign Closer</h3><p>Lead #${id}</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Select closer</label>
        <select id="assignSelect">${closers.map(c => `<option value="${c.id}">${esc(c.full_name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="assignConfirm">Reassign</button></div>
  </div></div>`, {
    onMount: div => div.querySelector('#assignConfirm').addEventListener('click', async () => {
      const closerId = Number(div.querySelector('#assignSelect').value);
      try { await api(`/customers/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ assigned_to: closerId }) }); closeOverlay(); toast('Closer reassigned', 'success'); refresh(); }
      catch (e) { toast(e.message, 'error'); }
    })
  });
}

/* ----- New lead (fronter) ----- */
function openNewLeadModal(preset) {
  const closers = state.users.filter(u => normRole(u.role) === 'closer');
  openOverlay(`<div class="overlay center"><div class="modal wide scale-in">
    <div class="modal-head"><div><h3>Submit New Lead</h3><p>Once submitted, this lead is locked and cannot be edited</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      <div class="notice">${svg('info')} You'll retain visibility into this lead's status as it moves through Closer and Chase.</div>
      <form id="leadForm">
        <div class="form-grid">
          <div class="field"><label>Customer Name</label><input id="f_name" required></div>
          <div class="field"><label>Phone</label><input id="f_phone" required></div>
          <div class="field"><label>Date of Birth</label><input id="f_dob" type="date" required></div>
          <div class="field"><label>Closer</label><select id="f_closer" required><option value="">Select closer</option>${closers.map(c => `<option value="${c.id}" ${preset?.closerId === c.id ? 'selected' : ''}>${esc(c.full_name)}</option>`).join('')}</select></div>
          <div class="field"><label>Booking Day</label><select id="f_day" required>${BOOKING_DAYS.map(d => `<option ${preset?.day === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Booking Time</label><select id="f_time" required>${BOOKING_SLOTS.map(t => `<option ${preset?.time === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field full"><label>Notes</label><textarea id="f_notes" rows="3"></textarea></div>
        </div>
      </form>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="leadSubmit">Submit &amp; Lock Lead</button></div>
  </div></div>`, {
    onMount: div => div.querySelector('#leadSubmit').addEventListener('click', async () => {
      const g = id => div.querySelector('#' + id);
      if (!g('f_name').value || !g('f_phone').value || !g('f_dob').value || !g('f_closer').value) { toast('Please fill all required fields', 'error'); return; }
      try {
        await api('/customers', {
          method: 'POST', body: JSON.stringify({
            customer_name: g('f_name').value, phone_number: g('f_phone').value, date_of_birth: g('f_dob').value,
            notes: g('f_notes').value, closer_id: Number(g('f_closer').value), booking_day: g('f_day').value, booking_time: g('f_time').value
          })
        });
        closeOverlay(); toast('Lead submitted and locked', 'success'); refresh();
      } catch (e) { toast(e.message, 'error'); }
    })
  });
}

/* ----- Team: new user / edit role / delete ----- */
function openNewUserModal() {
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>Add Team Member</h3><p>Creates a new login for the operations console</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field full"><label>Full Name</label><input id="u_name" required></div>
        <div class="field full"><label>Email</label><input id="u_email" type="email" required></div>
        <div class="field"><label>Password</label><input id="u_pass" type="password" required></div>
        <div class="field"><label>Role</label><select id="u_role"><option value="fronter">Fronter</option><option value="closer">Closer</option><option value="chase">Chase</option><option value="qa">QA</option><option value="manager">Manager</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="userSubmit">Create User</button></div>
  </div></div>`, {
    onMount: div => div.querySelector('#userSubmit').addEventListener('click', async () => {
      const g = id => div.querySelector('#' + id);
      if (!g('u_name').value || !g('u_email').value || !g('u_pass').value) { toast('Please fill all fields', 'error'); return; }
      try {
        await api('/users', { method: 'POST', body: JSON.stringify({ full_name: g('u_name').value, email: g('u_email').value, password: g('u_pass').value, role: g('u_role').value }) });
        closeOverlay(); toast('User created', 'success');
        state.users = await api('/users'); renderView();
      } catch (e) { toast(e.message, 'error'); }
    })
  });
}
function isSuperAdmin() { return ['superadmin', 'super_admin'].includes(role()); }
function openEditUserModal(id) {
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  const canResetPassword = isSuperAdmin();
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>${esc(u.full_name)}</h3><p>${esc(u.email)}</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Role</label><select id="edit_role">${['fronter', 'closer', 'chase', 'qa', 'manager', 'admin', 'superadmin'].map(r => `<option value="${r}" ${normRole(u.role) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Daily Limit</label><input id="edit_limit" type="number" value="${u.daily_limit ?? 50}"></div>
      ${canResetPassword ? `
      <div class="table-sub-head"><h3>${svg('key')} Reset Password</h3></div>
      <div class="notice">${svg('info')} This immediately changes ${esc(u.full_name)}'s login password. Only super admins can do this.</div>
      <div class="field"><label>New Password</label><input id="edit_password" type="text" placeholder="Minimum 6 characters"></div>
      <button class="btn btn-soft btn-sm" id="resetPassBtn" type="button">${svg('key')} Set New Password</button>
      ` : ''}
    </div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-primary" id="editSave">Save Changes</button></div>
  </div></div>`, {
    onMount: div => {
      div.querySelector('#editSave').addEventListener('click', async () => {
        try {
          await api(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role: div.querySelector('#edit_role').value }) });
          await api(`/users/${id}/limit`, { method: 'PATCH', body: JSON.stringify({ daily_limit: Number(div.querySelector('#edit_limit').value) }) });
          closeOverlay(); toast('User updated', 'success');
          state.users = await api('/users'); renderView();
        } catch (e) { toast(e.message, 'error'); }
      });
      div.querySelector('#resetPassBtn')?.addEventListener('click', async () => {
        const pw = div.querySelector('#edit_password').value;
        if (!pw || pw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
        try {
          await api(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password: pw }) });
          toast(`Password updated for ${u.full_name}`, 'success');
          div.querySelector('#edit_password').value = '';
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  });
}
async function deleteUser(id) {
  const u = state.users.find(x => x.id === id);
  if (!u) return;
  openOverlay(`<div class="overlay center"><div class="modal scale-in">
    <div class="modal-head"><div><h3>Remove ${esc(u.full_name)}?</h3><p>This cannot be undone.</p></div><button class="icon-btn" data-close>${svg('x')}</button></div>
    <div class="modal-foot"><button class="btn btn-soft" data-close>Cancel</button><button class="btn btn-danger" id="delConfirm">${svg('trash')} Remove</button></div>
  </div></div>`, {
    onMount: div => div.querySelector('#delConfirm').addEventListener('click', async () => {
      try { await api(`/users/${id}`, { method: 'DELETE' }); closeOverlay(); toast('User removed', 'success'); state.users = await api('/users'); renderView(); }
      catch (e) { toast(e.message, 'error'); }
    })
  });
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */
const mq = window.matchMedia('(max-width:760px)');
function syncMenuVisibility() {
  const btn = document.getElementById('menuBtn');
  if (btn) btn.style.display = mq.matches ? 'grid' : 'none';
}
mq.addEventListener('change', syncMenuVisibility);
const _origRenderShell = renderShell;
renderShell = function () { _origRenderShell(); syncMenuVisibility(); };

(async () => {
  applyTheme();
  state.token = localStorage.getItem('vn_token');
  try { state.user = JSON.parse(localStorage.getItem('vn_user') || 'null'); } catch { state.user = null; }
  if (state.token && state.user) {
    try { await boot(); } catch { logout(); }
  } else {
    renderLogin();
  }
  window.addEventListener('resize', () => { if (window.innerWidth > 760) setSidebar(false); });
})();
