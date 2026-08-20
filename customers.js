const express = require('express');
const router = express.Router();
const pool = require('./db');
const authenticate = require('./middleware');

// 1. ADD NEW LEAD (Fronting / Admin / Chase / Closer)
router.post('/', authenticate, async (req, res) => {
  const { customer_name, phone_number, date_of_birth, additional_notes } = req.body;

  if (!customer_name || !phone_number || !date_of_birth) {
    return res.status(400).json({ error: 'Name, phone number, and date of birth are required.' });
  }

  try {
    const newCustomer = await pool.query(
      `INSERT INTO customers (customer_name, phone_number, date_of_birth, additional_notes, created_by_agent_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, customer_name, date_of_birth, additional_notes, status, created_at`,
      [customer_name, phone_number, date_of_birth, additional_notes || '', req.user.id]
    );

    res.status(201).json({
      message: 'Lead created successfully',
      customer: newCustomer.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET ALL LEADS (Includes QA Score, Status, and Remarks for Agents & Management)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');

    const formattedCustomers = result.rows.map(c => {
      if (req.user.role === 'fronting' || req.user.role === 'fronter') {
        return {
          ...c,
          phone_number: '******' + c.phone_number.slice(-4)
        };
      }
      return c;
    });

    res.json(formattedCustomers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. UPDATE LEAD DISPOSITION / STATUS
router.patch('/:id/status', authenticate, async (req, res) => {
  const { id } = req.params;
  const { status, assigned_agent_id } = req.body;

  const validStatuses = [
    'Pending',
    "Didn't Pick Up",
    'Re-scheduled',
    'On Call',
    'Form Sent',
    'Form Completed',
    'Deal Won/Closed',
    'Follow-up Required',
    'Not Interested/Lost'
  ];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status disposition.' });
  }

  try {
    const updatedLead = await pool.query(
      `UPDATE customers 
       SET status = COALESCE($1, status), 
           assigned_agent_id = COALESCE($2, assigned_agent_id),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3 
       RETURNING *`,
      [status, assigned_agent_id || null, id]
    );

    if (updatedLead.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    res.json({
      message: 'Lead status updated successfully',
      lead: updatedLead.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. QA AUDIT & SCORE LEAD (QA Auditor / Superadmin / Manager)
router.patch('/:id/qa', authenticate, async (req, res) => {
  const { id } = req.params;
  const { qa_score, qa_status, qa_remarks } = req.body;

  // Restrict access to QA, Superadmin, and Managers
  if (!['qa', 'superadmin', 'manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. QA or management privileges required.' });
  }

  if (qa_status && !['Pass', 'Fail', 'Pending'].includes(qa_status)) {
    return res.status(400).json({ error: 'Invalid QA status. Must be Pass, Fail, or Pending.' });
  }

  try {
    const updatedQaLead = await pool.query(
      `UPDATE customers 
       SET qa_score = COALESCE($1, qa_score), 
           qa_status = COALESCE($2, qa_status), 
           qa_remarks = COALESCE($3, qa_remarks),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [qa_score, qa_status, qa_remarks, id]
    );

    if (updatedQaLead.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    res.json({
      message: 'QA review saved successfully',
      lead: updatedQaLead.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;