const pool = require('./db');
const bcrypt = require('bcrypt');

async function seedUsers() {
  try {
    // 1. Drop existing constraint
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`);

    // 2. Normalize existing rows with invalid roles to 'agent'
    await pool.query(`
      UPDATE users 
      SET role = 'agent' 
      WHERE role NOT IN ('superadmin', 'admin', 'manager', 'closer', 'fronter', 'agent') 
         OR role IS NULL;
    `);

    // 3. Re-add constraint
    await pool.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('superadmin', 'admin', 'manager', 'closer', 'fronter', 'agent'));
    `);

    // 4. Hash default password
    const hashedPassword = await bcrypt.hash('123456', 10);

    const users = [
      ['Super Admin', 'superadmin@crm.com', hashedPassword, 'superadmin'],
      ['Operations Admin', 'admin@crm.com', hashedPassword, 'admin'],
      ['Team Manager', 'manager@crm.com', hashedPassword, 'manager'],
      ['Closer Agent', 'closer@crm.com', hashedPassword, 'closer'],
      ['Fronting Agent', 'fronting@crm.com', hashedPassword, 'fronter']
    ];

    // 5. Upsert seed accounts
    for (const user of users) {
      await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE 
         SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;`,
        user
      );
    }

    console.log('✅ Existing roles normalized & accounts seeded successfully!');
    return true;
  } catch (err) {
    console.error('❌ Error seeding users:', err);
    throw err; // Pass error back to the route handler instead of crashing Node
  }
}

// Export module without auto-executing or exiting process
module.exports = seedUsers;