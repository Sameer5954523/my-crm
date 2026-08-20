const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const cron = require('node-cron');
const JWT_SECRET = process.env.JWT_SECRET || 'crm_secret_key_change_in_production';

const BOOKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BOOKING_SLOTS = [
  '9:15 AM', '10:15 AM', '11:30 AM', '12:45 PM',
  '1:45 PM', '3:00 PM', '4:15 PM', '5:00 PM'
];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}
function isMgmtRole(role) {
  return ['admin', 'superadmin', 'super_admin', 'manager'].includes(normalizeRole(role));
}

function normalizeSlot(slot) {
  return String(slot || '').trim().replace(/^0(?=\d:)/, '');
}

function isValidBooking(day, time) {
  return BOOKING_DAYS.includes(day) && BOOKING_SLOTS.includes(normalizeSlot(time));
}

// Chase-stage statuses that exist only once a closer has already marked a
// lead "Customer Form Completed". Fronters never see past this point.
const CHASE_STAGE_STATUSES = ['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'];
const NOTES_ROLES = ['closer', 'manager', 'chase', 'admin', 'superadmin', 'super_admin'];
const QA_ROLES = ['qa', 'admin', 'superadmin', 'super_admin', 'manager'];

function maskPhoneNumber(phone) {
  if (!phone) return phone;
  const digits = String(phone);
  if (digits.length <= 4) return '*'.repeat(digits.length);
  const start = digits.slice(0, 2);
  const end = digits.slice(-2);
  const middle = '*'.repeat(Math.max(3, digits.length - 4));
  return `${start}${middle}${end}`;
}

// Fronters ("agents") are locked to "Customer Form Completed" as the final
// visible disposition, with zero SLA/chase visibility beyond that point.
function maskLeadForFronter(lead) {
  const masked = { ...lead };
  if (CHASE_STAGE_STATUSES.includes(masked.status)) masked.status = 'Customer Form Completed';
  if (CHASE_STAGE_STATUSES.includes(masked.customer_status)) masked.customer_status = 'Customer Form Completed';
  masked.phone_number = maskPhoneNumber(masked.phone_number);
  masked.chase_assigned_to = null;
  masked.chase_agent_name = null;
  masked.chase_assigned_at = null;
  masked.chase_due_at = null;
  masked.chase_form_sent_at = null;
  masked.chase_return_due_at = null;
  masked.chase_form_received_at = null;
  masked.chase_form_not_received_at = null;
  masked.follow_up_at = null;
  masked.notes_count = 0;
  return masked;
}


// Initialize Knex with SQLite
const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './database.sqlite'
  },
  useNullAsDefault: true
});

// Initialize Database Tables & Schema Migrations
async function initDb() {
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('full_name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
      table.string('role').defaultTo('fronter');
      table.integer('daily_limit').defaultTo(50);
    });
  } else {
    const hasDailyLimit = await db.schema.hasColumn('users', 'daily_limit');
    if (!hasDailyLimit) {
      await db.schema.alterTable('users', (table) => {
        table.integer('daily_limit').defaultTo(50);
      });
    }
  }

  const hasCustomers = await db.schema.hasTable('customers');
  if (!hasCustomers) {
    await db.schema.createTable('customers', (table) => {
      table.increments('id').primary();
      table.string('customer_name').notNullable();
      table.string('phone_number');
      table.string('date_of_birth');
      table.text('notes');
      table.string('status').defaultTo('Pending');
      table.integer('assigned_to').references('id').inTable('users');
      table.string('last_updated_by');
      table.string('last_updated_by_role');
      table.string('follow_up_at');
      table.integer('qa_score');
      table.string('qa_status');
      table.text('qa_remarks');
      table.string('qa_graded_by');
      table.timestamps(true, true);
    });
  } else {
    const hasQaScore = await db.schema.hasColumn('customers', 'qa_score');
    if (!hasQaScore) {
      await db.schema.alterTable('customers', (table) => {
        table.integer('qa_score');
        table.string('qa_status');
        table.text('qa_remarks');
        table.string('qa_graded_by');
      });
    }
  }

  // Chase workflow fields. These are additive migrations so existing CRM
  // databases keep their current data.
  const chaseColumns = [
    ['chase_assigned_to', 'integer'],
    ['chase_assigned_at', 'string'],
    ['chase_due_at', 'string'],
    ['chase_form_sent_at', 'string'],
    ['chase_return_due_at', 'string'],
    ['chase_form_received_at', 'string'],
    ['chase_form_not_received_at', 'string']
  ];
  for (const [columnName, columnType] of chaseColumns) {
    const exists = await db.schema.hasColumn('customers', columnName);
    if (!exists) {
      await db.schema.alterTable('customers', table => {
        table[columnType](columnName);
      });
    }
  }

  // Indexes used by the operational queues.
  try {
    await db.raw('CREATE INDEX IF NOT EXISTS customers_assigned_to_idx ON customers (assigned_to)');
    await db.raw('CREATE INDEX IF NOT EXISTS customers_chase_assigned_idx ON customers (chase_assigned_to)');
    await db.raw('CREATE INDEX IF NOT EXISTS customers_status_idx ON customers (status)');
  } catch (indexErr) {
    console.warn('Could not create customer queue indexes:', indexErr.message);
  }

  // Lead notes: a threaded, multi-author log visible to closer/manager/
  // chase/admin/superadmin only. Fronters never see this table's contents.
  const hasLeadNotes = await db.schema.hasTable('lead_notes');
  if (!hasLeadNotes) {
    await db.schema.createTable('lead_notes', (table) => {
      table.increments('id').primary();
      table.integer('customer_id').references('id').inTable('customers').notNullable();
      table.integer('author_id');
      table.string('author_name');
      table.string('author_role');
      table.text('note').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    try {
      await db.raw('CREATE INDEX IF NOT EXISTS lead_notes_customer_idx ON lead_notes (customer_id)');
    } catch (indexErr) {
      console.warn('Could not create lead_notes index:', indexErr.message);
    }
  }

  const hasAuditLogs = await db.schema.hasTable('audit_logs');
  if (!hasAuditLogs) {
    await db.schema.createTable('audit_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id');
      table.string('user_name');
      table.integer('lead_id');
      table.string('action_type');
      table.text('details');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  // Chase call log: every phone contact with the customer is recorded with
  // a mandatory date/time/note, and can be added at any stage (even after
  // "Customer Form Not Received") so chase agents can keep updating leads.
  const hasChaseCallLogs = await db.schema.hasTable('chase_call_logs');
  if (!hasChaseCallLogs) {
    await db.schema.createTable('chase_call_logs', (table) => {
      table.increments('id').primary();
      table.integer('customer_id').references('id').inTable('customers').notNullable();
      table.integer('agent_id');
      table.string('agent_name');
      table.string('outcome').notNullable();
      table.string('call_date').notNullable();
      table.string('call_time').notNullable();
      table.string('call_day');
      table.text('note').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    try {
      await db.raw('CREATE INDEX IF NOT EXISTS chase_call_logs_customer_idx ON chase_call_logs (customer_id)');
    } catch (indexErr) {
      console.warn('Could not create chase_call_logs index:', indexErr.message);
    }
  }

  // APPOINTMENTS / SLOT SYSTEM
  // A slot belongs to a specific closer + day + time. Older versions of the
  // CRM created only 40 generic slots (with no closer_id), which made the
  // dashboard unable to associate a fronted lead with a closer.
  const hasAppointments = await db.schema.hasTable('appointments');
  if (!hasAppointments) {
    await db.schema.createTable('appointments', (table) => {
      table.increments('id').primary();
      table.string('day_of_week').notNullable();
      table.string('time_slot').notNullable();
      table.integer('fronter_id').references('id').inTable('users');
      table.integer('closer_id').references('id').inTable('users');
      table.integer('customer_id').references('id').inTable('customers');
      table.string('status').defaultTo('Open'); // Open, Booked, Completed
      table.timestamps(true, true);
    });
  }

  // Prevent the same closer from being double-booked for the same slot.
  try {
    await db.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS appointments_closer_day_time_unique ' +
      'ON appointments (closer_id, day_of_week, time_slot)'
    );
  } catch (indexErr) {
    console.warn('Could not create appointment uniqueness index:', indexErr.message);
  }

  // Backfill the chase workflow for records created by older CRM versions.
  try {
    const chaseAgents = await db('users').where('role', 'chase').select('id');
    if (chaseAgents.length) {
      const legacyQueue = await db('customers')
        .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
        .select('id', 'status', 'follow_up_at', 'chase_assigned_to', 'chase_due_at', 'chase_return_due_at');

      for (const lead of legacyQueue) {
        const patch = {};
        if (!lead.chase_assigned_to) {
          const loads = await Promise.all(chaseAgents.map(async a => {
            const row = await db('customers')
              .where('chase_assigned_to', a.id)
              .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
              .count('id as count').first();
            return { id: a.id, count: Number(row?.count || 0) };
          }));
          loads.sort((a, b) => a.count - b.count);
          patch.chase_assigned_to = loads[0].id;
          patch.chase_assigned_at = new Date().toISOString();
        }
        if (lead.status === 'Customer Form Completed' && !lead.chase_due_at) {
          patch.chase_due_at = lead.follow_up_at || new Date(Date.now() + 86400000).toISOString();
        }
        if (lead.status === 'Customer Form Sent' && !lead.chase_return_due_at) {
          patch.chase_return_due_at = lead.follow_up_at;
        }
        if (Object.keys(patch).length) {
          await db('customers').where({ id: lead.id }).update(patch);
        }
      }
    }
  } catch (backfillErr) {
    console.warn('Chase workflow backfill warning:', backfillErr.message);
  }
}

initDb().catch(console.error);

const app = express();
app.use(cors());
app.use(express.json());

// REQUEST LOGGER
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});
app.get('/api/seed-now', async (req, res) => {
  try {
    const initDb = require('./initDb');
    const seedUsers = require('./seedUsers');
    
    if (typeof initDb === 'function') await initDb();
    if (typeof seedUsers === 'function') await seedUsers();

    res.send("Database initialized and users seeded successfully!");
  } catch (err) {
    res.status(500).send("Seeding failed: " + err.message);
  }
});
// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// AUTH LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db('users').where({ email, password }).first();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, full_name: user.full_name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// USER CREATION HANDLER
async function handleUserCreation(req, res) {
  const { full_name, email, password, role, daily_limit } = req.body;
  try {
    const [id] = await db('users').insert({ 
      full_name, 
      email, 
      password, 
      role: role || 'fronter',
      daily_limit: daily_limit || 50
    });
    
    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      action_type: 'USER_CREATED',
      details: `Created user ${email} with role ${role || 'fronter'}`
    });

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/auth/users', authenticateToken, handleUserCreation);
app.post('/api/auth/users/', authenticateToken, handleUserCreation);
app.post('/api/auth/register', authenticateToken, handleUserCreation);
app.post('/api/auth/register/', authenticateToken, handleUserCreation);
app.post('/api/users', authenticateToken, handleUserCreation);
app.post('/api/users/', authenticateToken, handleUserCreation);
app.post('/api/register', authenticateToken, handleUserCreation);
app.post('/api/register/', authenticateToken, handleUserCreation);

async function fetchAllUsers(req, res) {
  try {
    const users = await db('users').select('id', 'full_name', 'email', 'role', 'daily_limit');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/users', authenticateToken, fetchAllUsers);
app.get('/api/users/', authenticateToken, fetchAllUsers);
app.get('/api/auth/users', authenticateToken, fetchAllUsers);
app.get('/api/auth/users/', authenticateToken, fetchAllUsers);

app.patch('/api/users/:id/role', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!isMgmtRole(req.user.role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can change roles.' });
  }
  try {
    await db('users').where({ id }).update({ role });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id/limit', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { daily_limit } = req.body;
  if (!isMgmtRole(req.user.role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can change daily limits.' });
  }
  try {
    await db('users').where({ id }).update({ daily_limit });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!isMgmtRole(req.user.role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can remove team members.' });
  }
  if (Number(id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'You cannot remove your own account.' });
  }
  try {
    await db('users').where({ id }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password resets are restricted to super admins — this touches every
// team member's login credentials, so it's the most sensitive user-admin
// action in the app.
app.patch('/api/users/:id/password', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  const role = normalizeRole(req.user.role);
  if (!['superadmin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Only super admins can reset team member passwords.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  try {
    const target = await db('users').where({ id }).first();
    if (!target) return res.status(404).json({ error: 'User not found.' });
    await db('users').where({ id }).update({ password: String(password) });
    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: null,
      action_type: 'PASSWORD_RESET',
      details: `Reset password for ${target.full_name || target.email} (user #${id})`
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ANALYTICS ENDPOINT
app.get('/api/analytics', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const isFronter = role === 'fronter' || role === 'fronting';
    const isChase = role === 'chase';
    const totalQuery = isFronter
      ? db('customers').where('assigned_to', Number(req.user.id))
      : isChase
        ? db('customers').where('chase_assigned_to', Number(req.user.id))
        : db('customers');

    const totalLeads = await totalQuery.clone().count('id as count').first();
    const closedDeals = await totalQuery.clone()
      .whereIn('status', ['Deal Closed / Won', 'Deal Won/Closed'])
      .count('id as count').first();

    // "Completed" for a fronter means the closer reached the hand-off
    // disposition (or anything further along the chase pipeline, which a
    // fronter cannot see individually but which still counts as completed)
    // OR the deal was ultimately won.
    const completedStatuses = isFronter
      ? ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed']
      : ['Customer Form Completed', 'Deal Closed / Won', 'Deal Won/Closed'];
    const completed = await totalQuery.clone()
      .whereIn('status', completedStatuses)
      .count('id as count').first();

    const unassignedLeads = await db('customers').whereNull('assigned_to').count('id as count').first();
    const chaseOverdue = await db('customers')
      .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
      .whereNotNull('follow_up_at')
      .where('follow_up_at', '<', new Date().toISOString())
      .count('id as count').first();

    const total = Number(totalLeads?.count || 0);
    const closed = Number(closedDeals?.count || 0);
    const completedCount = Number(completed?.count || 0);

    const closerStatusList = [
      "Customer Doesn't Qualify",
      "Customer Didn't Pick Up",
      "Customer Not Interested",
      "Customer On Call",
      "Customer Re-scheduled",
      "Customer Form Completed"
    ];

    let dispositionBreakdown, closerDispositionBreakdown;

    if (isFronter) {
      // Fronters ("agents") never see chase-stage dispositions individually —
      // everything past the closer hand-off is folded into "Customer Form
      // Completed" so their reporting matches what they're allowed to see.
      const rows = await totalQuery.clone().select('status');
      const counts = {};
      rows.forEach(r => {
        let s = r.status || 'Pending';
        if (CHASE_STAGE_STATUSES.includes(s)) s = 'Customer Form Completed';
        counts[s] = (counts[s] || 0) + 1;
      });
      const entries = Object.entries(counts).map(([status, count]) => ({ status, count }));
      dispositionBreakdown = entries
        .map(e => ({ ...e, percentage: total ? Number(((e.count / total) * 100).toFixed(1)) : 0 }))
        .sort((a, b) => b.count - a.count);
      closerDispositionBreakdown = entries
        .filter(e => closerStatusList.includes(e.status))
        .sort((a, b) => b.count - a.count);
    } else {
      const dispositionRows = await totalQuery.clone()
        .select('status')
        .count('id as count')
        .groupBy('status')
        .orderBy('count', 'desc');

      dispositionBreakdown = dispositionRows.map(r => ({
        status: r.status || 'Pending',
        count: Number(r.count || 0),
        percentage: total ? Number(((Number(r.count || 0) / total) * 100).toFixed(1)) : 0
      }));

      const closerDispositionRows = await totalQuery.clone()
        .whereIn('status', closerStatusList)
        .select('status')
        .count('id as count')
        .groupBy('status')
        .orderBy('count', 'desc');

      closerDispositionBreakdown = closerDispositionRows.map(r => ({
        status: r.status,
        count: Number(r.count || 0)
      }));
    }

    res.json({
      role,
      totalLeads: total,
      closedDeals: closed,
      completedLeads: completedCount,
      completionRate: total > 0 ? ((completedCount / total) * 100).toFixed(1) : '0.0',
      conversionRate: total > 0 ? ((closed / total) * 100).toFixed(1) : '0.0',
      unassignedLeads: Number(unassignedLeads?.count || 0),
      chaseOverdue: isFronter ? 0 : Number(chaseOverdue?.count || 0),
      dispositionBreakdown,
      closerDispositionBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PERIODIC SELF-REPORTS (daily / weekly / monthly) — primarily for fronters
// to track their own submission volume, completion rate, and QA performance.
app.get('/api/reports/mine', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const isFronter = role === 'fronter' || role === 'fronting';
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';

    const now = new Date();
    let rangeStart;
    if (period === 'daily') {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'weekly') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const rangeEnd = now;

    const baseQuery = db('customers');
    if (isFronter) baseQuery.where('assigned_to', Number(req.user.id));
    else if (role === 'closer') baseQuery.where('closer_id', Number(req.user.id));
    else if (role === 'chase') baseQuery.where('chase_assigned_to', Number(req.user.id));

    const periodLeads = await baseQuery.clone()
      .where('created_at', '>=', rangeStart.toISOString())
      .select('id', 'status', 'created_at', 'qa_score', 'qa_status');

    const completedStatuses = ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed'];
    const totalLeads = periodLeads.length;
    const completedLeads = periodLeads.filter(l => completedStatuses.includes(l.status)).length;

    const dailyMap = {};
    periodLeads.forEach(l => {
      const d = new Date(l.created_at).toISOString().slice(0, 10);
      if (!dailyMap[d]) dailyMap[d] = { date: d, leads: 0, completed: 0 };
      dailyMap[d].leads += 1;
      if (completedStatuses.includes(l.status)) dailyMap[d].completed += 1;
    });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // QA is scoped to the user's own graded leads regardless of the selected
    // period, since QA feedback should always be fully visible to the agent.
    const qaRows = await baseQuery.clone().whereNotNull('qa_score').select('id', 'customer_name', 'qa_score', 'qa_status', 'qa_remarks', 'qa_graded_by', 'updated_at');
    const qaScores = qaRows.map(r => Number(r.qa_score)).filter(n => !Number.isNaN(n));
    const avgScore = qaScores.length ? Number((qaScores.reduce((a, b) => a + b, 0) / qaScores.length).toFixed(1)) : null;
    const QA_PASS_THRESHOLD = 75;
    const passCount = qaScores.filter(s => s >= QA_PASS_THRESHOLD).length;

    res.json({
      period,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      totalLeads,
      completedLeads,
      completionRate: totalLeads > 0 ? Number(((completedLeads / totalLeads) * 100).toFixed(1)) : 0,
      dailyBreakdown,
      qa: {
        threshold: QA_PASS_THRESHOLD,
        averageScore: avgScore,
        gradedCount: qaScores.length,
        passCount,
        passRate: qaScores.length ? Number(((passCount / qaScores.length) * 100).toFixed(1)) : null,
        meetsThreshold: avgScore != null ? avgScore >= QA_PASS_THRESHOLD : null,
        entries: qaRows.map(r => ({
          lead_id: r.id,
          customer_name: r.customer_name,
          qa_score: r.qa_score,
          qa_status: r.qa_status,
          qa_remarks: r.qa_remarks,
          graded_by: r.qa_graded_by,
          graded_at: r.updated_at
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------------------------------------------------------------
// ADVANCED REPORTING (admin / superadmin / manager)
// ---------------------------------------------------------------------
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, columns) {
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvEscape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n');
  return header + '\n' + body;
}
function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
function resolveReportRange(query) {
  const now = new Date();
  let start, end = now;
  if (query.start) {
    start = new Date(query.start);
  } else if (query.range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (query.range === 'week') {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  } else if (query.range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(2000, 0, 1); // "all time"
  }
  if (query.end) end = new Date(query.end + 'T23:59:59');
  return { start, end };
}

app.get('/api/reports/overview', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (!['admin', 'superadmin', 'super_admin', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can view advanced reports.' });
  }

  try {
    const { start, end } = resolveReportRange(req.query);

    const rows = await db('customers')
      .leftJoin('appointments', function () {
        this.on('appointments.customer_id', '=', 'customers.id')
          .andOn('appointments.status', '!=', db.raw('?', ['Open']));
      })
      .leftJoin('users as fronter', 'customers.assigned_to', 'fronter.id')
      .leftJoin('users as closer', 'appointments.closer_id', 'closer.id')
      .leftJoin('users as chase', 'customers.chase_assigned_to', 'chase.id')
      .whereBetween('customers.created_at', [toSqlDateTime(start), toSqlDateTime(end)])
      .select(
        'customers.id', 'customers.customer_name', 'customers.phone_number', 'customers.status',
        'customers.created_at', 'customers.updated_at', 'customers.qa_score', 'customers.qa_status',
        'customers.chase_due_at', 'customers.chase_return_due_at', 'customers.follow_up_at',
        'fronter.full_name as fronter_name', 'closer.full_name as closer_name', 'chase.full_name as chase_agent_name'
      );

    const total = rows.length;
    const completedStatuses = ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed'];
    const completed = rows.filter(r => completedStatuses.includes(r.status)).length;
    const won = rows.filter(r => ['Deal Closed / Won', 'Deal Won/Closed'].includes(r.status)).length;
    const nowIso = new Date().toISOString();
    const chaseOverdue = rows.filter(r =>
      ['Customer Form Completed', 'Customer Form Sent'].includes(r.status) &&
      r.follow_up_at && r.follow_up_at < nowIso
    ).length;

    const gradedRows = rows.filter(r => r.qa_score !== null && r.qa_score !== undefined);
    const avgQaScore = gradedRows.length ? Number((gradedRows.reduce((a, r) => a + Number(r.qa_score), 0) / gradedRows.length).toFixed(1)) : null;
    const qaPassCount = gradedRows.filter(r => Number(r.qa_score) >= 75).length;
    const qaPassRate = gradedRows.length ? Number(((qaPassCount / gradedRows.length) * 100).toFixed(1)) : null;

    const dispoMap = {};
    rows.forEach(r => { const s = r.status || 'Pending'; dispoMap[s] = (dispoMap[s] || 0) + 1; });
    const dispositionBreakdown = Object.entries(dispoMap)
      .map(([status, count]) => ({ status, count, percentage: total ? Number(((count / total) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.count - a.count);

    const dailyMap = {};
    rows.forEach(r => {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      if (!dailyMap[d]) dailyMap[d] = { date: d, leads: 0, completed: 0 };
      dailyMap[d].leads += 1;
      if (completedStatuses.includes(r.status)) dailyMap[d].completed += 1;
    });
    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    const funnelOrder = ['Pending', 'Customer Form Completed', 'Customer Form Sent', 'Customer Form Received'];
    function funnelStageIndex(status) {
      if (['Deal Closed / Won', 'Deal Won/Closed', 'Customer Form Received'].includes(status)) return 3;
      if (status === 'Customer Form Sent' || status === 'Customer Form Not Received') return 2;
      if (status === 'Customer Form Completed') return 1;
      return 0;
    }
    const funnel = funnelOrder.map((stage, idx) => ({
      stage,
      count: rows.filter(r => funnelStageIndex(r.status) >= idx).length
    }));

    const byAgent = (nameKey) => {
      const map = {};
      rows.forEach(r => {
        const name = r[nameKey];
        if (!name) return;
        if (!map[name]) map[name] = { name, total: 0, completed: 0 };
        map[name].total += 1;
        if (completedStatuses.includes(r.status)) map[name].completed += 1;
      });
      return Object.values(map)
        .map(a => ({ ...a, completionRate: a.total ? Number(((a.completed / a.total) * 100).toFixed(1)) : 0 }))
        .sort((a, b) => b.total - a.total);
    };

    const fronterPerformance = byAgent('fronter_name');
    const closerPerformance = byAgent('closer_name');

    const chaseMap = {};
    rows.forEach(r => {
      if (!r.chase_agent_name) return;
      if (!chaseMap[r.chase_agent_name]) chaseMap[r.chase_agent_name] = { name: r.chase_agent_name, assigned: 0, sent: 0, received: 0, notReceived: 0, overdue: 0 };
      const c = chaseMap[r.chase_agent_name];
      c.assigned += 1;
      if (r.status === 'Customer Form Sent') c.sent += 1;
      if (r.status === 'Customer Form Received') c.received += 1;
      if (r.status === 'Customer Form Not Received') c.notReceived += 1;
      if (['Customer Form Completed', 'Customer Form Sent'].includes(r.status) && r.follow_up_at && r.follow_up_at < nowIso) c.overdue += 1;
    });
    const chasePerformance = Object.values(chaseMap).sort((a, b) => b.assigned - a.assigned);

    // Deterministic, rule-based narrative (no external AI calls).
    const recommendations = [];
    if (chaseOverdue > 0) recommendations.push(`${chaseOverdue} lead${chaseOverdue > 1 ? 's are' : ' is'} currently overdue in the chase pipeline — prioritize these to protect SLA compliance.`);
    if (avgQaScore !== null && avgQaScore < 75) recommendations.push(`Average QA score is ${avgQaScore}/100, below the 75% pass threshold — consider targeted coaching.`);
    if (qaPassRate !== null && qaPassRate < 80) recommendations.push(`QA pass rate is ${qaPassRate}% — review recent failed calls for common compliance gaps.`);
    const topDispo = dispositionBreakdown[0];
    if (topDispo && topDispo.status !== 'Customer Form Completed' && topDispo.status !== 'Pending' && total > 5) {
      recommendations.push(`"${topDispo.status}" is the most common outcome (${topDispo.percentage}% of leads) — investigate whether this reflects a lead-quality or scripting issue.`);
    }
    if (total > 0 && completed / total < 0.3) recommendations.push(`Only ${(completed / total * 100).toFixed(1)}% of leads reach Customer Form Completed or beyond — closer conversion may need review.`);
    if (!recommendations.length) recommendations.push('Pipeline metrics are within healthy ranges for the selected period.');

    res.json({
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        leads: total,
        completed,
        won,
        completionRate: total ? Number(((completed / total) * 100).toFixed(1)) : 0,
        conversionRate: total ? Number(((won / total) * 100).toFixed(1)) : 0,
        chaseOverdue,
        avgQaScore,
        qaPassRate,
        qaGradedCount: gradedRows.length,
        qaPassThreshold: 75
      },
      dispositionBreakdown,
      dailyTrend,
      funnel,
      fronterPerformance,
      closerPerformance,
      chasePerformance,
      recommendations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/export', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (!['admin', 'superadmin', 'super_admin', 'manager'].includes(role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can export reports.' });
  }

  try {
    const { start, end } = resolveReportRange(req.query);
    const query = db('customers')
      .leftJoin('appointments', function () {
        this.on('appointments.customer_id', '=', 'customers.id')
          .andOn('appointments.status', '!=', db.raw('?', ['Open']));
      })
      .leftJoin('users as fronter', 'customers.assigned_to', 'fronter.id')
      .leftJoin('users as closer', 'appointments.closer_id', 'closer.id')
      .leftJoin('users as chase', 'customers.chase_assigned_to', 'chase.id')
      .whereBetween('customers.created_at', [toSqlDateTime(start), toSqlDateTime(end)])
      .select(
        'customers.id', 'customers.customer_name', 'customers.phone_number', 'customers.date_of_birth',
        'customers.status', 'appointments.day_of_week as booking_day', 'appointments.time_slot as booking_time',
        'customers.created_at', 'customers.updated_at',
        'customers.qa_score', 'customers.qa_status', 'customers.qa_remarks',
        'customers.chase_due_at', 'customers.chase_form_sent_at', 'customers.chase_return_due_at',
        'customers.chase_form_received_at', 'customers.chase_form_not_received_at',
        'fronter.full_name as fronter_name', 'closer.full_name as closer_name', 'chase.full_name as chase_agent_name'
      );

    if (req.query.status) query.where('customers.status', req.query.status);

    const rows = await query.orderBy('customers.created_at', 'desc');

    const columns = [
      { label: 'Lead ID', value: 'id' },
      { label: 'Customer Name', value: 'customer_name' },
      { label: 'Phone Number', value: 'phone_number' },
      { label: 'Date of Birth', value: 'date_of_birth' },
      { label: 'Disposition', value: 'status' },
      { label: 'Fronter', value: 'fronter_name' },
      { label: 'Closer', value: 'closer_name' },
      { label: 'Chase Agent', value: 'chase_agent_name' },
      { label: 'Booking Day', value: 'booking_day' },
      { label: 'Booking Time', value: 'booking_time' },
      { label: 'QA Score', value: 'qa_score' },
      { label: 'QA Status', value: 'qa_status' },
      { label: 'QA Remarks', value: 'qa_remarks' },
      { label: 'Form Sent At', value: 'chase_form_sent_at' },
      { label: 'Form Received At', value: 'chase_form_received_at' },
      { label: 'Form Not Received At', value: 'chase_form_not_received_at' },
      { label: 'Created At', value: 'created_at' },
      { label: 'Updated At', value: 'updated_at' }
    ];

    const csv = toCsv(rows, columns);
    const filename = req.query.status
      ? `report_${req.query.status.replace(/[^a-z0-9]+/gi, '_')}.csv`
      : 'report_all_leads.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/ai/insights', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const overdue = await db('customers')
      .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
      .whereNotNull('follow_up_at')
      .where('follow_up_at', '<', new Date().toISOString())
      .count('id as count').first();

    const queue = await db('customers')
      .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
      .count('id as count').first();

    res.json({
      scoreSummary: role === 'chase'
        ? 'AI Chase Monitor: SLA, backlog and form-return risk are being tracked live.'
        : 'AI Pipeline Assistant: workflow health and SLA exceptions are being monitored.',
      recommendation: Number(overdue?.count || 0) > 0
        ? `🚨 ${overdue.count} chase task(s) are overdue. Prioritize the oldest red timers first.`
        : `⚡ ${queue.count || 0} lead(s) are currently in the chase workflow.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADVANCED CHASE AI REPORTING
app.get('/api/ai/chase-report', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const canView = role === 'chase' || ['admin', 'superadmin', 'super_admin', 'manager'].includes(role);
    if (!canView) return res.status(403).json({ error: 'Chase AI reporting is restricted.' });

    const rows = await db('customers')
      .leftJoin('users as chase_user', 'customers.chase_assigned_to', 'chase_user.id')
      .leftJoin('users as fronter_user', 'customers.assigned_to', 'fronter_user.id')
      .select(
        'customers.*',
        'chase_user.full_name as chase_agent_name',
        'fronter_user.full_name as fronter_name'
      )
      .whereIn('customers.status', [
        'Customer Form Completed',
        'Customer Form Sent',
        'Customer Form Received',
        'Customer Form Not Received',
        'Deal Closed / Won',
        'Deal Won/Closed'
      ])
      .orderBy('customers.updated_at', 'desc');

    const scopedRows = role === 'chase'
      ? rows.filter(r => Number(r.chase_assigned_to) === Number(req.user.id))
      : rows;

    const now = Date.now();
    const overdueRows = scopedRows.filter(r =>
      ['Customer Form Completed', 'Customer Form Sent'].includes(r.status) &&
      r.follow_up_at && new Date(r.follow_up_at).getTime() < now
    );

    const completedQueue = scopedRows.filter(r => r.status === 'Customer Form Completed');
    const sentQueue = scopedRows.filter(r => r.status === 'Customer Form Sent');
    const received = scopedRows.filter(r => r.status === 'Customer Form Received');
    const notReceived = scopedRows.filter(r => r.status === 'Customer Form Not Received');

    const sendDurations = scopedRows
      .filter(r => r.chase_form_sent_at && r.created_at)
      .map(r => (new Date(r.chase_form_sent_at) - new Date(r.created_at)) / 3600000)
      .filter(Number.isFinite);

    const returnDurations = scopedRows
      .filter(r => r.chase_form_received_at && r.chase_form_sent_at)
      .map(r => (new Date(r.chase_form_received_at) - new Date(r.chase_form_sent_at)) / 86400000)
      .filter(Number.isFinite);

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const onTime = scopedRows.filter(r =>
      r.chase_form_sent_at && r.chase_due_at &&
      new Date(r.chase_form_sent_at).getTime() <= new Date(r.chase_due_at).getTime()
    ).length;
    const sentCount = scopedRows.filter(r => r.chase_form_sent_at).length;

    const agentMap = {};
    scopedRows.forEach(r => {
      const key = r.chase_assigned_to || 'unassigned';
      if (!agentMap[key]) {
        agentMap[key] = {
          name: r.chase_agent_name || 'Unassigned',
          assigned: 0,
          sent: 0,
          received: 0,
          overdue: 0
        };
      }
      agentMap[key].assigned++;
      if (r.chase_form_sent_at) agentMap[key].sent++;
      if (r.status === 'Customer Form Received') agentMap[key].received++;
      if (overdueRows.some(o => o.id === r.id)) agentMap[key].overdue++;
    });

    const agentPerformance = Object.values(agentMap)
      .map(a => ({
        ...a,
        sendRate: a.assigned ? Number(((a.sent / a.assigned) * 100).toFixed(1)) : 0,
        returnRate: a.sent ? Number(((a.received / a.sent) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.returnRate - a.returnRate);

    const riskLeads = overdueRows.slice(0, 8).map(r => ({
      id: r.id,
      customer_name: r.customer_name,
      status: r.status,
      chase_agent_name: r.chase_agent_name || 'Unassigned',
      due_at: r.follow_up_at,
      overdue_hours: Math.max(0, Math.floor((now - new Date(r.follow_up_at).getTime()) / 3600000))
    }));

    const activeCount = completedQueue.length + sentQueue.length;
    const overdueRate = activeCount ? Number(((overdueRows.length / activeCount) * 100).toFixed(1)) : 0;
    const returnRate = sentCount ? Number(((received.length / sentCount) * 100).toFixed(1)) : 0;
    const slaHealth = overdueRate === 0 ? 'Excellent' : overdueRate <= 10 ? 'Healthy' : overdueRate <= 25 ? 'At Risk' : 'Critical';
    const avgReturn = avg(returnDurations);
    const expectedReturnsNext7d = sentQueue.filter(r =>
      r.chase_return_due_at &&
      new Date(r.chase_return_due_at).getTime() <= now + 7 * 86400000
    ).length;
    const workloadScore = Math.min(100, Math.round(
      Math.max(0, 100 - overdueRate * 2 - Math.max(0, activeCount - 20) * 1.5)
    ));

    const recommendations = [];
    if (overdueRows.length) recommendations.push(`Prioritize ${overdueRows.length} overdue lead(s); the oldest red timer should be actioned first.`);
    if (completedQueue.length > sentQueue.length * 1.5 && completedQueue.length > 3) recommendations.push('The 24-hour physical-form handoff is the current bottleneck.');
    if (sentQueue.length > received.length * 2 && sentQueue.length > 3) recommendations.push('Form-return velocity is slowing; schedule proactive customer follow-ups before the 7-day SLA expires.');
    if (!recommendations.length) recommendations.push('Pipeline is within current SLA thresholds. Keep monitoring the 24-hour and 7-day timers.');

    res.json({
      generated_at: new Date().toISOString(),
      scope: role === 'chase' ? 'My chase workflow' : 'All chase workflow',
      kpis: {
        active: scopedRows.filter(r => ['Customer Form Completed', 'Customer Form Sent'].includes(r.status)).length,
        awaitingSend: completedQueue.length,
        awaitingReturn: sentQueue.length,
        formReceived: received.length,
        formNotReceived: notReceived.length,
        overdue: overdueRows.length,
        sendSlaRate: sentCount ? Number(((onTime / sentCount) * 100).toFixed(1)) : 100,
        avgHoursToSend: Number(avg(sendDurations).toFixed(1)),
        avgDaysToReturn: Number(avgReturn.toFixed(1)),
        overdueRate,
        returnRate,
        slaHealth,
        workloadScore,
        expectedReturnsNext7d
      },
      agentPerformance,
      riskLeads,
      recommendations
    });
  } catch (err) {
    console.error('Chase AI report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI TODO LIST — rule-based prioritized action list for chase agents.
// A chase agent sees only their own list; admins/superadmins/managers can
// see any agent's list (or all agents combined) to monitor workload.
app.get('/api/ai/chase-todo', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  const isChase = role === 'chase';
  const isMgmtViewer = isMgmtRole(role);
  if (!isChase && !isMgmtViewer) {
    return res.status(403).json({ error: 'Chase AI todo lists are restricted.' });
  }

  try {
    let targetAgentId = null;
    if (isChase) targetAgentId = Number(req.user.id);
    else if (req.query.agent_id) targetAgentId = Number(req.query.agent_id);

    let query = db('customers')
      .leftJoin('users as chase_user', 'customers.chase_assigned_to', 'chase_user.id')
      .select('customers.*', 'chase_user.full_name as chase_agent_name')
      .whereIn('customers.status', ['Customer Form Completed', 'Customer Form Sent'])
      .whereNotNull('customers.chase_assigned_to');

    if (targetAgentId) query = query.where('customers.chase_assigned_to', targetAgentId);

    const rows = await query;
    const nowMs = Date.now();

    const todos = rows.map(r => {
      const dueAt = r.status === 'Customer Form Completed' ? r.chase_due_at : r.chase_return_due_at;
      const dueMs = dueAt ? new Date(dueAt).getTime() : null;
      const overdue = dueMs !== null && dueMs < nowMs;
      const hoursLeft = dueMs !== null ? (dueMs - nowMs) / 3600000 : null;

      let action, priority;
      if (overdue) {
        action = r.status === 'Customer Form Completed'
          ? `Send the physical form to ${r.customer_name} \u2014 24h window has lapsed`
          : `Call ${r.customer_name} \u2014 the 7-day return window has lapsed`;
        priority = 'urgent';
      } else if (hoursLeft !== null && hoursLeft < 4) {
        action = r.status === 'Customer Form Completed'
          ? `Send the form to ${r.customer_name} \u2014 due in under 4 hours`
          : `Follow up with ${r.customer_name} \u2014 return window closes soon`;
        priority = 'soon';
      } else {
        action = r.status === 'Customer Form Completed'
          ? `Send the physical form to ${r.customer_name}`
          : `Check in with ${r.customer_name} on the returned form`;
        priority = 'normal';
      }

      return {
        leadId: r.id,
        customer_name: r.customer_name,
        chase_agent_name: r.chase_agent_name,
        status: r.status,
        action,
        priority,
        overdue,
        hoursLeft: hoursLeft !== null ? Number(hoursLeft.toFixed(1)) : null,
        dueAt
      };
    }).sort((a, b) => {
      const order = { urgent: 0, soon: 1, normal: 2 };
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return (a.hoursLeft ?? 999) - (b.hoursLeft ?? 999);
    });

    res.json({
      generated_at: new Date().toISOString(),
      scope: targetAgentId ? 'agent' : (isMgmtViewer ? 'all' : 'agent'),
      todos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PENDING TASKS / NOTIFICATIONS — role-aware inbox of things needing action.
app.get('/api/notifications/pending', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  try {
    const items = [];
    const nowIso = new Date().toISOString();

    if (role === 'closer') {
      const rows = await db('customers')
        .join('appointments', function () {
          this.on('appointments.customer_id', '=', 'customers.id')
            .andOn('appointments.closer_id', '=', db.raw('?', [Number(req.user.id)]))
            .andOn('appointments.status', '!=', db.raw('?', ['Open']));
        })
        .where('customers.status', 'Pending')
        .select('customers.id', 'customers.customer_name');
      rows.forEach(r => items.push({ leadId: r.id, type: 'disposition', severity: 'normal', title: `Disposition needed: ${r.customer_name}`, subtitle: 'Booked lead awaiting your outcome' }));
    }

    if (role === 'chase') {
      const rows = await db('customers')
        .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
        .where('chase_assigned_to', Number(req.user.id))
        .whereNotNull('follow_up_at')
        .select('id', 'customer_name', 'status', 'follow_up_at');
      rows.forEach(r => {
        const overdue = r.follow_up_at < nowIso;
        if (overdue) items.push({ leadId: r.id, type: 'chase_overdue', severity: 'urgent', title: `OVERDUE: ${r.customer_name}`, subtitle: r.status === 'Customer Form Completed' ? 'Physical form not yet sent' : 'Customer has not returned the form' });
      });
      const unclaimed = await db('customers').where('status', 'Customer Form Completed').whereNull('chase_assigned_to').select('id', 'customer_name');
      unclaimed.forEach(r => items.push({ leadId: r.id, type: 'unclaimed', severity: 'normal', title: `Unclaimed lead: ${r.customer_name}`, subtitle: 'Awaiting a chase agent to claim it' }));
    }

    if (role === 'qa') {
      const completedStatuses = ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed'];
      const rows = await db('customers').whereIn('status', completedStatuses).whereNull('qa_score').select('id', 'customer_name');
      rows.forEach(r => items.push({ leadId: r.id, type: 'qa_pending', severity: 'normal', title: `Grade call: ${r.customer_name}`, subtitle: 'No QA score yet' }));
    }

    if (isMgmtRole(role)) {
      const overdueRows = await db('customers')
        .leftJoin('users as chase_user', 'customers.chase_assigned_to', 'chase_user.id')
        .whereIn('customers.status', ['Customer Form Completed', 'Customer Form Sent'])
        .whereNotNull('customers.follow_up_at')
        .where('customers.follow_up_at', '<', nowIso)
        .select('customers.id', 'customers.customer_name', 'chase_user.full_name as chase_agent_name');
      overdueRows.forEach(r => items.push({ leadId: r.id, type: 'chase_overdue', severity: 'urgent', title: `OVERDUE: ${r.customer_name}`, subtitle: `Assigned to ${r.chase_agent_name || 'no one'}` }));

      const completedStatuses = ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed'];
      const ungraded = await db('customers').whereIn('status', completedStatuses).whereNull('qa_score').count('id as count').first();
      if (Number(ungraded?.count || 0) > 0) items.push({ leadId: null, type: 'qa_backlog', severity: 'normal', title: `${ungraded.count} calls awaiting QA review`, subtitle: 'No lead-specific link \u2014 open All Leads to review' });
    }

    res.json({ count: items.length, items: items.slice(0, 50) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REMINDERS ENDPOINT
app.get('/api/reminders/due', authenticateToken, async (req, res) => {
  try {
    const reminders = await db('customers')
      .whereNotNull('follow_up_at')
      .orderBy('follow_up_at', 'asc');

    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CUSTOMERS / LEADS ENDPOINTS
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, disposition, assigned, search } = req.query;
    const role = normalizeRole(req.user.role);

    let query = db('customers')
      .leftJoin('users as assigned_user', 'customers.assigned_to', 'assigned_user.id')
      .leftJoin('users as chase_user', 'customers.chase_assigned_to', 'chase_user.id')
      .leftJoin('appointments as lead_appointment', function () {
        this.on('lead_appointment.customer_id', '=', 'customers.id')
          .andOn('lead_appointment.status', '!=', db.raw('?', ['Open']));
      })
      .leftJoin('users as appointment_closer', 'lead_appointment.closer_id', 'appointment_closer.id')
      .select(
        'customers.*',
        'customers.status as customer_status',
        'assigned_user.full_name as assigned_to_name',
        'chase_user.full_name as chase_agent_name',
        'lead_appointment.day_of_week as booking_day',
        'lead_appointment.time_slot as booking_time',
        'lead_appointment.id as appointment_id',
        'lead_appointment.closer_id as closer_id',
        'lead_appointment.status as appointment_status',
        'appointment_closer.full_name as closer_name',
        db.raw('(SELECT COUNT(*) FROM lead_notes WHERE lead_notes.customer_id = customers.id) as notes_count')
      );

    // Fronters only ever see leads they submitted. Their ownership is retained
    // after the closer hands a lead to chase.
    if (role === 'fronter' || role === 'fronting') {
      query.where('customers.assigned_to', Number(req.user.id));
    } else if (role === 'closer') {
      // Closers get both queues: their own leads and a read-only view of
      // other closer leads. The UI marks the two scopes separately.
      query.whereExists(
        db('appointments')
          .select(db.raw('1'))
          .whereRaw('appointments.customer_id = customers.id')
          .whereNotNull('appointments.closer_id')
          .whereIn('appointments.status', ['Booked', 'Completed'])
      );
    } else if (role === 'chase') {
      query.where(function () {
        this.where(function () {
          this.whereIn('customers.status', ['Customer Form Completed', 'Customer Form Sent'])
            .where(function () {
              this.whereNull('customers.chase_assigned_to')
                .orWhere('customers.chase_assigned_to', Number(req.user.id));
            });
        }).orWhere(function () {
          this.whereIn('customers.status', ['Customer Form Received', 'Customer Form Not Received'])
            .where('customers.chase_assigned_to', Number(req.user.id));
        });
      });
    }

    if (disposition && disposition !== 'all') {
      query.where('customers.status', disposition);
    }

    // For management, "assigned" continues to mean fronter ownership.
    if (assigned === 'unassigned') {
      query.whereNull('customers.assigned_to');
    } else if (assigned) {
      query.where('customers.assigned_to', Number(assigned));
    }

    if (search) {
      query.where((builder) => {
        builder.where('customers.customer_name', 'like', `%${search}%`)
          .orWhere('customers.phone_number', 'like', `%${search}%`)
          .orWhere('customers.notes', 'like', `%${search}%`);
      });
    }

    const countQuery = query.clone().clearSelect().clearOrder().countDistinct('customers.id as count');
    const totalResult = await countQuery.first();
    const total = Number(totalResult?.count || 0);

    const offset = (Number(page) - 1) * Number(limit);
    const data = await query
      .groupBy('customers.id')
      .orderBy('customers.id', 'desc')
      .limit(Number(limit))
      .offset(offset);

    const isFronterRole = role === 'fronter' || role === 'fronting';
    const decorated = data.map(lead => {
      const withFlags = {
        ...lead,
        is_own_closer_lead: role === 'closer' ? Number(lead.closer_id) === Number(req.user.id) : false,
        is_own_chase_lead: role === 'chase' ? Number(lead.chase_assigned_to) === Number(req.user.id) : false
      };
      return isFronterRole ? maskLeadForFronter(withFlags) : withFlags;
    });

    res.json({
      data: decorated,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (err) {
    console.error('Fetch customers error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/unassigned', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    let query = db('customers').whereNull('chase_assigned_to');

    if (role === 'chase') {
      query = query.where('status', 'Customer Form Completed');
    } else if (role === 'closer') {
      query = query.whereNot('status', 'Customer Form Received');
    } else if (!['admin', 'superadmin', 'super_admin', 'manager'].includes(role)) {
      query = query.whereRaw('1 = 0');
    }

    const leads = await query
      .leftJoin('users as fronter_user', 'customers.assigned_to', 'fronter_user.id')
      .leftJoin('appointments', 'customers.id', 'appointments.customer_id')
      .leftJoin('users as closer_user', 'appointments.closer_id', 'closer_user.id')
      .select(
        'customers.*',
        'fronter_user.full_name as fronter_name',
        'closer_user.full_name as closer_name'
      )
      .groupBy('customers.id')
      .orderBy('customers.id', 'desc');

    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', authenticateToken, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    const lead = await db('customers')
      .leftJoin('appointments', function () {
        this.on('appointments.customer_id', '=', 'customers.id')
          .andOn('appointments.status', '!=', db.raw('?', ['Open']));
      })
      .leftJoin('users as fronter', 'customers.assigned_to', 'fronter.id')
      .leftJoin('users as closer', 'appointments.closer_id', 'closer.id')
      .leftJoin('users as chase', 'customers.chase_assigned_to', 'chase.id')
      .where('customers.id', Number(req.params.id))
      .select(
        'customers.*',
        'appointments.id as appointment_id',
        'appointments.day_of_week as booking_day',
        'appointments.time_slot as booking_time',
        'appointments.closer_id as closer_id',
        'appointments.status as appointment_status',
        'fronter.full_name as fronter_name',
        'closer.full_name as closer_name',
        'chase.full_name as chase_agent_name'
      )
      .first();

    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    const isManagement = ['admin', 'superadmin', 'super_admin', 'manager', 'qa'].includes(role);
    const isFronterRole = role === 'fronter' || role === 'fronting';
    const canSee = isManagement ||
      (isFronterRole && Number(lead.assigned_to) === Number(req.user.id)) ||
      (role === 'closer' && Number(lead.closer_id) === Number(req.user.id)) ||
      (role === 'chase' && (
        Number(lead.chase_assigned_to) === Number(req.user.id) ||
        ['Customer Form Completed', 'Customer Form Sent'].includes(lead.status)
      ));

    if (!canSee) return res.status(403).json({ error: 'You do not have access to this lead.' });

    const payload = isFronterRole ? maskLeadForFronter(lead) : lead;

    if (NOTES_ROLES.includes(role)) {
      payload.notes_thread = await db('lead_notes')
        .where({ customer_id: Number(req.params.id) })
        .orderBy('created_at', 'desc');
      payload.call_log = await db('chase_call_logs')
        .where({ customer_id: Number(req.params.id) })
        .orderBy('created_at', 'desc');
    } else {
      payload.notes_thread = [];
      payload.call_log = [];
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LEAD NOTES: visible/addable to closer, manager, chase, admin, superadmin only.
app.get('/api/customers/:id/notes', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (!NOTES_ROLES.includes(role)) {
    return res.status(403).json({ error: 'You do not have access to notes on this lead.' });
  }
  try {
    const notes = await db('lead_notes')
      .where({ customer_id: Number(req.params.id) })
      .orderBy('created_at', 'desc');
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers/:id/notes', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (!NOTES_ROLES.includes(role)) {
    return res.status(403).json({ error: 'You are not permitted to add notes to this lead.' });
  }

  const { note } = req.body;
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'Note text is required.' });
  }

  try {
    const id = Number(req.params.id);
    const lead = await db('customers').where({ id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    if (role === 'closer') {
      const ownAppointment = await db('appointments')
        .where({ customer_id: id, closer_id: Number(req.user.id) })
        .whereIn('status', ['Booked', 'Completed'])
        .first();
      if (!ownAppointment) {
        return res.status(403).json({ error: 'You can only add notes to your own leads.' });
      }
    }
    if (role === 'chase' && Number(lead.chase_assigned_to) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only add notes to leads assigned to you.' });
    }

    const [noteId] = await db('lead_notes').insert({
      customer_id: id,
      author_id: req.user.id,
      author_name: req.user.full_name || req.user.email,
      author_role: req.user.role,
      note: String(note).trim()
    });

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'NOTE_ADDED',
      details: `Added a note to lead #${id}`
    });

    const created = await db('lead_notes').where({ id: noteId }).first();
    res.json({ success: true, note: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', authenticateToken, async (req, res) => {
  const {
    customer_name,
    phone_number,
    date_of_birth,
    notes,
    assigned_to,
    booking_day,
    booking_time,
    closer_id
  } = req.body;

  if (!customer_name || !phone_number || !date_of_birth) {
    return res.status(400).json({ error: 'Customer name, phone number and date of birth are required.' });
  }

  const day = String(booking_day || '').trim();
  const time = normalizeSlot(booking_time);
  const closerId = Number(closer_id || assigned_to);

  if (!Number.isInteger(closerId) || closerId <= 0) {
    return res.status(400).json({ error: 'Please select a valid closer.' });
  }
  if (!isValidBooking(day, time)) {
    return res.status(400).json({ error: 'Please select a valid Monday-Friday booking day and time slot.' });
  }

  const closer = await db('users')
    .where({ id: closerId })
    .first();
  if (!closer || normalizeRole(closer.role) !== 'closer') {
    return res.status(400).json({ error: 'Selected user is not a closer.' });
  }

  try {
    const result = await db.transaction(async trx => {
      // The same closer cannot have two customers at the same day/time.
      const existing = await trx('appointments')
        .where({
          closer_id: closerId,
          day_of_week: day,
          time_slot: time
        })
        .whereIn('status', ['Booked', 'Completed'])
        .first();

      if (existing) {
        const conflict = await trx('customers').where({ id: existing.customer_id }).first();
        throw Object.assign(
          new Error(
            `That slot is already booked for ${closer.full_name}` +
            (conflict ? ` by ${conflict.customer_name}.` : '.')
          ),
          { statusCode: 409 }
        );
      }

      const [id] = await trx('customers').insert({
        customer_name,
        phone_number,
        date_of_birth,
        notes,
        // assigned_to remains the fronting user for pipeline ownership.
        assigned_to: normalizeRole(req.user.role) === 'fronter' ? req.user.id : (assigned_to ? Number(assigned_to) : null),
        last_updated_by: req.user.full_name || req.user.email,
        last_updated_by_role: req.user.role
      });

      await trx('appointments').insert({
        day_of_week: day,
        time_slot: time,
        fronter_id: req.user.id,
        closer_id: closerId,
        customer_id: id,
        status: 'Booked'
      });

      await trx('audit_logs').insert({
        user_id: req.user.id,
        user_name: req.user.full_name || req.user.email,
        lead_id: id,
        action_type: 'LEAD_CREATED',
        details: `Created lead ${customer_name} and booked ${day} ${time} with closer ${closer.full_name}`
      });

      return id;
    });

    res.json({ success: true, id: result });
  } catch (err) {
    console.error('Create lead error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create lead' });
  }
});

app.patch('/api/customers/:id/claim', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db('customers').where({ id }).update({
      assigned_to: req.user.id,
      last_updated_by: req.user.full_name || req.user.email,
      last_updated_by_role: req.user.role
    });

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'LEAD_CLAIMED',
      details: `Claimed lead #${id}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


async function assignChaseWorkflow(trx, customerId, now = new Date()) {
  const chaseAgents = await trx('users')
    .whereRaw("LOWER(TRIM(role)) = 'chase'")
    .select('id');

  const updates = {
    chase_due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    follow_up_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    chase_form_sent_at: null,
    chase_return_due_at: null,
    chase_form_received_at: null
  };

  if (chaseAgents.length) {
    const loadRows = await Promise.all(chaseAgents.map(async agent => {
      const row = await trx('customers')
        .where('chase_assigned_to', agent.id)
        .whereIn('status', ['Customer Form Completed', 'Customer Form Sent'])
        .count('id as count')
        .first();
      return { id: agent.id, count: Number(row?.count || 0) };
    }));
    loadRows.sort((a, b) => a.count - b.count || a.id - b.id);
    updates.chase_assigned_to = loadRows[0].id;
    updates.chase_assigned_at = now.toISOString();
  } else {
    updates.chase_assigned_to = null;
    updates.chase_assigned_at = null;
  }

  return updates;
}

// CHASE CALL LOG: every phone contact is logged with a mandatory date/time
// and note. Unlike the old direct status PATCH, this can be used again even
// after "Customer Form Not Received" to keep updating the lead over time.
app.post('/api/customers/:id/chase-call', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (role !== 'chase') {
    return res.status(403).json({ error: 'Only chase agents can log calls.' });
  }

  const { outcome, call_date, call_time, note } = req.body;
  const allowedOutcomes = ['Form Sent', 'Form Not Sent', 'Form Received', 'Form Not Received'];
  if (!allowedOutcomes.includes(outcome)) {
    return res.status(400).json({ error: 'Invalid call outcome.' });
  }
  if (!call_date || !call_time) {
    return res.status(400).json({ error: 'Call date and time are required.' });
  }
  if (!note || !String(note).trim()) {
    return res.status(400).json({ error: 'A note is required for every call log entry.' });
  }

  try {
    const id = Number(req.params.id);
    const lead = await db('customers').where({ id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (Number(lead.chase_assigned_to) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'This lead is assigned to another chase agent.' });
    }

    const callDateTime = new Date(`${call_date}T${call_time}`);
    if (isNaN(callDateTime.getTime())) {
      return res.status(400).json({ error: 'Invalid call date or time.' });
    }
    const callDay = callDateTime.toLocaleDateString('en-US', { weekday: 'long' });
    const nowIso = new Date().toISOString();

    const updates = {
      last_updated_by: req.user.full_name || req.user.email,
      last_updated_by_role: req.user.role,
      updated_at: nowIso
    };
    let statusChanged = false;

    if (outcome === 'Form Sent') {
      if (lead.status !== 'Customer Form Completed') {
        return res.status(400).json({ error: 'The form can only be marked sent while the lead is awaiting send.' });
      }
      updates.status = 'Customer Form Sent';
      updates.chase_form_sent_at = callDateTime.toISOString();
      updates.chase_return_due_at = new Date(callDateTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      updates.follow_up_at = updates.chase_return_due_at;
      statusChanged = true;
    } else if (outcome === 'Form Not Sent') {
      if (lead.status !== 'Customer Form Completed') {
        return res.status(400).json({ error: 'This lead is no longer awaiting an initial send.' });
      }
      // No status change — this is a logged attempt only, SLA keeps ticking.
    } else if (outcome === 'Form Received') {
      if (!['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'].includes(lead.status)) {
        return res.status(400).json({ error: 'The form must have been sent before it can be marked received.' });
      }
      updates.status = 'Customer Form Received';
      updates.chase_form_received_at = callDateTime.toISOString();
      updates.follow_up_at = null;
      statusChanged = true;
    } else if (outcome === 'Form Not Received') {
      if (!['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'].includes(lead.status)) {
        return res.status(400).json({ error: 'The form must have been sent before it can be marked not received.' });
      }
      updates.status = 'Customer Form Not Received';
      updates.chase_form_not_received_at = callDateTime.toISOString();
      updates.follow_up_at = null;
      statusChanged = true;
    }

    await db('customers').where({ id }).update(updates);

    const [logId] = await db('chase_call_logs').insert({
      customer_id: id,
      agent_id: req.user.id,
      agent_name: req.user.full_name || req.user.email,
      outcome,
      call_date,
      call_time,
      call_day: callDay,
      note: String(note).trim()
    });

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'CALL_LOGGED',
      details: `Logged a call (${outcome}) on lead #${id}${statusChanged ? ` — status updated to ${updates.status}` : ''}`
    });

    const updatedLead = await db('customers').where({ id }).first();
    res.json({ success: true, lead: updatedLead, callLogId: logId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = [
    'Pending',
    "Customer Doesn't Qualify",
    "Customer Didn't Pick Up",
    'Customer Not Interested',
    'Customer On Call',
    'Customer Re-scheduled',
    'Customer Form Completed',
    'Customer Form Sent',
    'Customer Form Received',
    'Customer Form Not Received',
    'Deal Closed / Won',
    'Deal Won/Closed',
    'Follow-up Required',
    'Not Interested / Lost',
    'Not Interested/Lost'
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid disposition.' });
  }

  try {
    const customer = await db('customers').where({ id }).first();
    if (!customer) return res.status(404).json({ error: 'Lead not found.' });

    const role = normalizeRole(req.user.role);
    const managementRoles = ['admin', 'superadmin', 'super_admin', 'manager'];
    const closerStatuses = [
      "Customer Doesn't Qualify",
      "Customer Didn't Pick Up",
      'Customer Not Interested',
      'Customer On Call',
      'Customer Re-scheduled',
      'Customer Form Completed'
    ];

    if (role === 'fronter' || role === 'fronting') {
      return res.status(403).json({ error: 'Fronters cannot change dispositions after submitting a lead.' });
    }

    if (role === 'closer') {
      const ownAppointment = await db('appointments')
        .where({ customer_id: Number(id), closer_id: Number(req.user.id) })
        .whereIn('status', ['Booked', 'Completed'])
        .first();
      if (!ownAppointment) {
        return res.status(403).json({ error: 'This lead belongs to another closer. You can view it but cannot change its disposition.' });
      }
      if (!closerStatuses.includes(status)) {
        return res.status(403).json({ error: 'Closers can only use closer-stage dispositions.' });
      }
    }

    const chaseStatuses = ['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'];
    if (role === 'chase' && !chaseStatuses.includes(status)) {
      return res.status(403).json({ error: 'Chase agents can only update physical-form workflow dispositions.' });
    }
    if (role === 'chase' && Number(customer.chase_assigned_to) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'This lead is assigned to another chase agent.' });
    }

    const now = new Date();
    const updates = {
      status,
      last_updated_by: req.user.full_name || req.user.email,
      last_updated_by_role: req.user.role,
      updated_at: now.toISOString()
    };

    // Keep assigned_to as the fronter owner. Chase has its own assignment field.
    if (status === 'Customer Form Completed') {
      const requestedChaseAgentId = Number(req.body.chase_agent_id);
      if (role === 'closer' && Number.isInteger(requestedChaseAgentId) && requestedChaseAgentId > 0) {
        const chaseAgent = await db('users').where({ id: requestedChaseAgentId }).first();
        if (!chaseAgent || normalizeRole(chaseAgent.role) !== 'chase') {
          return res.status(400).json({ error: 'Selected user is not a chase agent.' });
        }
        Object.assign(updates, {
          chase_assigned_to: requestedChaseAgentId,
          chase_assigned_at: now.toISOString(),
          chase_due_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          follow_up_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          chase_form_sent_at: null,
          chase_return_due_at: null,
          chase_form_received_at: null,
          chase_form_not_received_at: null
        });
      } else {
        Object.assign(updates, await assignChaseWorkflow(db, Number(id), now));
      }
    } else if (status === 'Customer Form Sent') {
      if (!['Customer Form Completed', 'Customer Form Sent'].includes(customer.status)) {
        return res.status(400).json({ error: 'Lead must first be in Customer Form Completed stage.' });
      }
      updates.chase_form_sent_at = now.toISOString();
      updates.chase_return_due_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      updates.follow_up_at = updates.chase_return_due_at;
      updates.chase_due_at = customer.chase_due_at || now.toISOString();
    } else if (status === 'Customer Form Received') {
      if (!['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'].includes(customer.status)) {
        return res.status(400).json({ error: 'Lead must first be in Customer Form Sent stage.' });
      }
      updates.chase_form_received_at = now.toISOString();
      updates.follow_up_at = null;
    } else if (status === 'Customer Form Not Received') {
      if (!['Customer Form Sent', 'Customer Form Received', 'Customer Form Not Received'].includes(customer.status)) {
        return res.status(400).json({ error: 'Lead must first be in Customer Form Sent stage.' });
      }
      updates.chase_form_not_received_at = now.toISOString();
      updates.follow_up_at = null;
    }

    await db.transaction(async trx => {
      await trx('customers').where({ id }).update(updates);
      await trx('audit_logs').insert({
        user_id: req.user.id,
        user_name: req.user.full_name || req.user.email,
        lead_id: id,
        action_type: 'STATUS_UPDATE',
        details: `Changed disposition to ${status}`
      });
    });

    const updated = await db('customers').where({ id }).first();
    res.json({
      success: true,
      lead: updated,
      sent_to_chase_queue: status === 'Customer Form Completed',
      chase_assigned_to: updated.chase_assigned_to || null
    });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/qa', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { qa_score, qa_status, qa_remarks } = req.body;
  const role = normalizeRole(req.user.role);

  if (!QA_ROLES.includes(role)) {
    return res.status(403).json({ error: 'Only QA and management can grade calls.' });
  }

  const score = Number(qa_score);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return res.status(400).json({ error: 'Score must be a whole number between 0 and 100.' });
  }
  if (!['Pass', 'Fail'].includes(qa_status)) {
    return res.status(400).json({ error: 'QA status must be Pass or Fail.' });
  }

  try {
    const lead = await db('customers').where({ id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    await db('customers').where({ id }).update({
      qa_score: score,
      qa_status,
      qa_remarks,
      qa_graded_by: req.user.full_name || req.user.email,
      last_updated_by: req.user.full_name || req.user.email,
      last_updated_by_role: req.user.role
    });

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'QA_GRADED',
      details: `Graded lead #${id} - Score: ${qa_score}, Status: ${qa_status}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/assign', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;
  const role = normalizeRole(req.user.role);

  if (!['admin', 'superadmin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Only Admin and Super Admin can reassign a closer.' });
  }

  const closerId = Number(assigned_to);
  if (!Number.isInteger(closerId) || closerId <= 0) {
    return res.status(400).json({ error: 'Please select a valid closer.' });
  }

  try {
    const closer = await db('users').where({ id: closerId }).first();
    if (!closer || normalizeRole(closer.role) !== 'closer') {
      return res.status(400).json({ error: 'Selected user is not a closer.' });
    }

    const appointment = await db('appointments')
      .where({ customer_id: Number(id) })
      .whereIn('status', ['Booked', 'Completed'])
      .first();

    if (!appointment) return res.status(404).json({ error: 'No active appointment/closer record exists for this lead.' });

    await db.transaction(async trx => {
      await trx('appointments').where({ id: appointment.id }).update({
        closer_id: closerId,
        updated_at: new Date().toISOString()
      });

      await trx('audit_logs').insert({
        user_id: req.user.id,
        user_name: req.user.full_name || req.user.email,
        lead_id: id,
        action_type: 'CLOSER_REASSIGNED',
        details: `Reassigned lead #${id} to closer ${closer.full_name}`
      });
    });

    res.json({ success: true, closer_id: closerId, closer_name: closer.full_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit chase-queue claim. It does not alter fronter/closer ownership.
app.patch('/api/customers/:id/claim-chase', authenticateToken, async (req, res) => {
  const role = normalizeRole(req.user.role);
  if (role !== 'chase') return res.status(403).json({ error: 'Only chase agents can claim chase leads.' });

  const { id } = req.params;
  try {
    const lead = await db('customers').where({ id }).first();
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });
    if (lead.status !== 'Customer Form Completed') {
      return res.status(400).json({ error: 'Only leads waiting for the physical form can be claimed.' });
    }
    if (lead.chase_assigned_to && Number(lead.chase_assigned_to) !== Number(req.user.id)) {
      return res.status(409).json({ error: 'This lead is already assigned to another chase agent.' });
    }

    await db('customers').where({ id }).update({
      chase_assigned_to: req.user.id,
      chase_assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'CHASE_CLAIMED',
      details: `Claimed chase lead #${id}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/customers/:id/reminder', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { follow_up_at } = req.body;
  const role = normalizeRole(req.user.role);

  if (['fronter', 'fronting', 'chase'].includes(role)) {
    return res.status(403).json({ error: 'Manual reminders are controlled by the workflow timers.' });
  }

  try {
    await db('customers').where({ id }).update({ follow_up_at });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const {
    customer_name,
    phone_number,
    date_of_birth,
    notes,
    booking_day,
    booking_time,
    closer_id,
    status
  } = req.body;

  try {
    const existingLead = await db('customers').where({ id }).first();
    if (!existingLead) return res.status(404).json({ error: 'Lead not found.' });

    const editRole = normalizeRole(req.user.role);
    if (editRole === 'fronter' || editRole === 'fronting') {
      return res.status(403).json({ error: 'Fronters cannot edit a lead after submission.' });
    }
    if (editRole === 'chase') {
      return res.status(403).json({ error: 'Chase agents should update the physical-form workflow through dispositions.' });
    }

    if (editRole === 'closer') {
      const ownAppointment = await db('appointments')
        .where({ customer_id: Number(id), closer_id: Number(req.user.id) })
        .whereIn('status', ['Booked', 'Completed'])
        .first();
      if (!ownAppointment) {
        return res.status(403).json({ error: 'This lead is not booked with your closer profile.' });
      }
      if (status && ![
        "Customer Doesn't Qualify",
        "Customer Didn't Pick Up",
        "Customer Not Interested",
        "Customer On Call",
        "Customer Re-scheduled",
        "Customer Form Completed"
      ].includes(status)) {
        return res.status(403).json({ error: 'Closers must use the closer-stage disposition controls.' });
      }
    }

    const updateData = {
      customer_name,
      date_of_birth,
      notes,
      last_updated_by: req.user.full_name || req.user.email,
      last_updated_by_role: req.user.role
    };
    if (status) updateData.status = status;
    if (phone_number !== undefined) updateData.phone_number = phone_number;

    await db.transaction(async trx => {
      await trx('customers').where({ id }).update(updateData);

      // Optional booking update. This keeps the customer table clean and
      // stores all slot information in appointments.
      if (booking_day !== undefined || booking_time !== undefined || closer_id !== undefined) {
        const currentAppointment = await trx('appointments')
          .where({ customer_id: Number(id) })
          .whereNot('status', 'Open')
          .first();

        const nextDay = booking_day !== undefined
          ? String(booking_day || '').trim()
          : currentAppointment?.day_of_week;
        const nextTime = booking_time !== undefined
          ? normalizeSlot(booking_time)
          : currentAppointment?.time_slot;
        const nextCloser = closer_id !== undefined
          ? Number(closer_id)
          : currentAppointment?.closer_id;

        if (nextDay && nextTime && nextCloser) {
          if (!status) updateData.status = 'Customer Re-scheduled';
          if (!isValidBooking(nextDay, nextTime)) {
            throw Object.assign(new Error('Invalid booking day or time slot.'), { statusCode: 400 });
          }

          const closer = await trx('users').where({ id: nextCloser }).first();
          if (!closer || normalizeRole(closer.role) !== 'closer') {
            throw Object.assign(new Error('Selected user is not a closer.'), { statusCode: 400 });
          }

          const conflict = await trx('appointments')
            .where({
              closer_id: nextCloser,
              day_of_week: nextDay,
              time_slot: nextTime
            })
            .whereNot('customer_id', Number(id))
            .whereIn('status', ['Booked', 'Completed'])
            .first();

          if (conflict) {
            throw Object.assign(new Error(`That slot is already booked for ${closer.full_name}.`), { statusCode: 409 });
          }

          if (currentAppointment) {
            await trx('appointments').where({ id: currentAppointment.id }).update({
              day_of_week: nextDay,
              time_slot: nextTime,
              closer_id: nextCloser,
              updated_at: new Date().toISOString()
            });
          } else {
            await trx('appointments').insert({
              day_of_week: nextDay,
              time_slot: nextTime,
              fronter_id: req.user.id,
              closer_id: nextCloser,
              customer_id: Number(id),
              status: 'Booked'
            });
          }
        }
      }

      await trx('audit_logs').insert({
        user_id: req.user.id,
        user_name: req.user.full_name || req.user.email,
        lead_id: id,
        action_type: 'LEAD_UPDATE',
        details: `Updated details for ${customer_name}`
      });
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update lead error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update lead' });
  }
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const role = normalizeRole(req.user.role);
  if (!['admin', 'superadmin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Only Admin and Super Admin can delete leads.' });
  }
  try {
    await db('customers').where({ id }).del();

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: id,
      action_type: 'LEAD_DELETE',
      details: `Deleted lead #${id}`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await db('audit_logs')
      .leftJoin('customers', 'audit_logs.lead_id', 'customers.id')
      .select('audit_logs.*', 'customers.customer_name as lead_name')
      .orderBy('audit_logs.id', 'desc')
      .limit(50);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// APPOINTMENTS & DASHBOARD ENDPOINTS
// ==========================================

app.get('/api/slots/dashboard', authenticateToken, async (req, res) => {
  try {
    const closers = await db('users')
      .select('id', 'full_name', 'email', 'role')
      .whereRaw("LOWER(TRIM(role)) = 'closer'")
      .orderBy('full_name', 'asc');

    const bookings = await db('appointments')
      .leftJoin('customers', 'appointments.customer_id', 'customers.id')
      .leftJoin('users as fronter', 'appointments.fronter_id', 'fronter.id')
      .leftJoin('users as closer', 'appointments.closer_id', 'closer.id')
      .whereNotNull('appointments.closer_id')
      .whereIn('appointments.day_of_week', BOOKING_DAYS)
      .whereIn('appointments.time_slot', BOOKING_SLOTS)
      .select(
        'appointments.id',
        'appointments.day_of_week',
        'appointments.time_slot',
        'appointments.status',
        'appointments.closer_id',
        'appointments.fronter_id',
        'appointments.customer_id',
        'customers.customer_name',
        'customers.phone_number',
        'customers.status as customer_status',
        'customers.assigned_to as assigned_to',
        'fronter.full_name as fronter_name',
        'closer.full_name as closer_name'
      );

    // Return only actual booked/completed appointments; the frontend creates
    // the complete closer x weekday x slot matrix and marks everything else open.
    res.json({
      selectedDate: req.query.date || null,
      weekStartDate: req.query.date || null,
      closers,
      weekdays: BOOKING_DAYS,
      slots: BOOKING_SLOTS,
      bookings: bookings.filter(b => ['Booked', 'Completed'].includes(b.status))
    });
  } catch (err) {
    console.error('Slot dashboard error:', err);
    res.status(500).json({ error: 'Failed to load slot dashboard.' });
  }
});

// LIVE AGENT PERFORMANCE — daily/weekly submission & completion counts per
// fronter, built for manager/admin/superadmin to watch in real time (and to
// project on a TV/wallboard via the Full View mode in the frontend).
app.get('/api/dashboard/live-agents', authenticateToken, async (req, res) => {
  if (!isMgmtRole(req.user.role)) {
    return res.status(403).json({ error: 'Only admins, super admins and managers can view the live agent dashboard.' });
  }
  try {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = now.getDay();
    const diffToMonday = (dow === 0 ? -6 : 1) - dow;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);

    const fronters = await db('users')
      .select('id', 'full_name')
      .whereRaw("LOWER(TRIM(role)) IN ('fronter','fronting')")
      .orderBy('full_name', 'asc');

    const rows = await db('customers').select('id', 'assigned_to', 'status', 'created_at', 'updated_at');
    const completedStatuses = ['Customer Form Completed', ...CHASE_STAGE_STATUSES, 'Deal Closed / Won', 'Deal Won/Closed'];

    const dayStartSql = toSqlDateTime(dayStart);
    const weekStartSql = toSqlDateTime(weekStart);

    const agents = fronters.map(f => {
      const mine = rows.filter(r => Number(r.assigned_to) === Number(f.id));
      const dailySent = mine.filter(r => r.created_at >= dayStartSql).length;
      const weeklySent = mine.filter(r => r.created_at >= weekStartSql).length;
      const dailyCompleted = mine.filter(r => completedStatuses.includes(r.status) && r.updated_at >= dayStartSql).length;
      const weeklyCompleted = mine.filter(r => completedStatuses.includes(r.status) && r.updated_at >= weekStartSql).length;
      return { id: f.id, name: f.full_name, dailySent, dailyCompleted, weeklySent, weeklyCompleted };
    }).sort((a, b) => b.dailySent - a.dailySent);

    res.json({
      generated_at: now.toISOString(),
      daily: { rangeStart: dayStart.toISOString() },
      weekly: { rangeStart: weekStart.toISOString() },
      agents,
      totals: {
        dailySent: agents.reduce((a, x) => a + x.dailySent, 0),
        dailyCompleted: agents.reduce((a, x) => a + x.dailyCompleted, 0),
        weeklySent: agents.reduce((a, x) => a + x.weeklySent, 0),
        weeklyCompleted: agents.reduce((a, x) => a + x.weeklyCompleted, 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    const appointments = await db('appointments')
      .leftJoin('customers', 'appointments.customer_id', 'customers.id')
      .leftJoin('users as fronter', 'appointments.fronter_id', 'fronter.id')
      .leftJoin('users as closer', 'appointments.closer_id', 'closer.id')
      .select(
        'appointments.*',
        'customers.customer_name',
        'customers.phone_number',
        'fronter.full_name as fronter_name',
        'closer.full_name as closer_name'
      );
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments/book', authenticateToken, async (req, res) => {
  const {
    slotId,
    customerId,
    closerId,
    booking_day,
    booking_time
  } = req.body;

  try {
    const day = String(booking_day || '').trim();
    const time = normalizeSlot(booking_time);

    if (!customerId || !Number.isInteger(Number(closerId)) || !isValidBooking(day, time)) {
      return res.status(400).json({ error: 'Invalid customer, closer, day or time slot.' });
    }

    const result = await db.transaction(async trx => {
      const closer = await trx('users').where({ id: Number(closerId) }).first();
      if (!closer || normalizeRole(closer.role) !== 'closer') {
        throw Object.assign(new Error('Selected user is not a closer.'), { statusCode: 400 });
      }

      let slot = await trx('appointments').where({
        closer_id: Number(closerId),
        day_of_week: day,
        time_slot: time
      }).first();

      if (!slot) {
        const [newId] = await trx('appointments').insert({
          day_of_week: day,
          time_slot: time,
          fronter_id: req.user.id,
          closer_id: Number(closerId),
          status: 'Open'
        });
        slot = await trx('appointments').where({ id: newId }).first();
      }

      if (slot.status !== 'Open') {
        throw Object.assign(new Error('Selected slot is already booked.'), { statusCode: 409 });
      }

      await trx('appointments').where({ id: slot.id }).update({
        customer_id: Number(customerId),
        closer_id: Number(closerId),
        fronter_id: req.user.id,
        status: 'Booked',
        updated_at: new Date().toISOString()
      });

      await trx('audit_logs').insert({
        user_id: req.user.id,
        user_name: req.user.full_name || req.user.email,
        lead_id: Number(customerId),
        action_type: 'APPOINTMENT_BOOKED',
        details: `Booked ${day} ${time} with closer ${closer.full_name}`
      });

      return slot.id;
    });

    res.json({ success: true, appointmentId: result });
  } catch (err) {
    console.error('Book appointment error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to book appointment.' });
  }
});

app.patch('/api/appointments/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const appointment = await db('appointments').where({ id }).first();
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const role = normalizeRole(req.user.role);
    const managementRoles = ['admin', 'superadmin', 'super_admin', 'manager'];

    if (status === 'Completed') {
      if (!['closer', ...managementRoles].includes(role)) {
        return res.status(403).json({ error: 'Only a closer or management can complete an appointment.' });
      }
      if (role === 'closer' && Number(appointment.closer_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You can only complete your own appointments.' });
      }
    }

    await db('appointments').where({ id }).update({
      status,
      updated_at: new Date().toISOString()
    });

    // Appointment completion is a real workflow handoff, so it must start
    // the same 24-hour Chase SLA and assignment used by the disposition API.
    if (status === 'Completed' && appointment.customer_id) {
      await db.transaction(async trx => {
        const now = new Date();
        const chaseUpdates = await assignChaseWorkflow(trx, Number(appointment.customer_id), now);
        await trx('customers').where({ id: appointment.customer_id }).update({
          status: 'Customer Form Completed',
          last_updated_by: req.user.full_name || req.user.email,
          last_updated_by_role: req.user.role,
          updated_at: now.toISOString(),
          ...chaseUpdates
        });
        await trx('audit_logs').insert({
          user_id: req.user.id,
          user_name: req.user.full_name || req.user.email,
          lead_id: appointment.customer_id,
          action_type: 'CHASE_HANDOFF',
          details: 'Appointment completed; lead handed to Chase with 24-hour physical-form SLA.'
        });
      });
    }

    await db('audit_logs').insert({
      user_id: req.user.id,
      user_name: req.user.full_name || req.user.email,
      lead_id: appointment.customer_id,
      action_type: 'APPOINTMENT_COMPLETED',
      details: `Appointment completed. Lead handed off to Chase Agent queue.`
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sunday night reset: Tuesday-Friday slots are cleared and recreated for
// every current closer. Monday bookings remain intact.
cron.schedule('59 23 * * 0', async () => {
  try {
    await db.transaction(async trx => {
      await trx('appointments').whereIn('day_of_week', ['Tuesday', 'Wednesday', 'Thursday', 'Friday']).del();

      const closers = await trx('users')
        .select('id')
        .whereRaw("LOWER(TRIM(role)) = 'closer'");

      for (const closer of closers) {
        for (const day of ['Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
          for (const slot of BOOKING_SLOTS) {
            await trx('appointments').insert({
              day_of_week: day,
              time_slot: slot,
              closer_id: closer.id,
              status: 'Open'
            });
          }
        }
      }
    });

    console.log('Sunday night slot refresh completed. Monday bookings retained.');
  } catch (err) {
    console.error('Sunday reset cron error:', err.message);
  }
});

// JSON API SAFETY NET: Catch-all for any unmatched /api/* request
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// STATIC ASSETS & FRONTEND SPA FALLBACK
// no-store so app.css/app.js are never served stale after an update — this
// app changes frequently during active development.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));

app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/api/seed-now', async (req, res) => {
  try {
    const initDb = require('./initDb');
    const seedUsers = require('./seedUsers');
    
    // Execute database creation and seeding sequentially
    if (typeof initDb === 'function') await initDb();
    if (typeof seedUsers === 'function') await seedUsers();

    res.send("Database initialized and users seeded successfully!");
  } catch (err) {
    res.status(500).send("Seeding failed: " + err.message);
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));