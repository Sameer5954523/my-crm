const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken, authorizeRoles } = require('../middleware');

// LOGIN ROUTE
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET || 'supersecretkey',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET ALL USERS (Superadmin & Admin only)
router.get('/users', authenticateToken, authorizeRoles('superadmin', 'admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, role, created_at FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// CREATE NEW USER (Superadmin & Admin only)
router.post('/users', authenticateToken, authorizeRoles('superadmin', 'admin'), async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Validate that the role is one of the allowed system roles
  const validRoles = ['superadmin', 'manager', 'qa', 'fronter', 'admin', 'closer', 'chase', 'fronting'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role`,
      [full_name, email, hashedPassword, role]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists.' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

module.exports = router;