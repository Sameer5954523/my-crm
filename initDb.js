const pool = require('./db');

const createTables = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) CHECK (role IN ('superadmin', 'manager', 'qa', 'fronter', 'admin', 'closer', 'chase', 'fronting')) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        date_of_birth DATE NOT NULL,
        additional_notes TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        created_by_agent_id INT REFERENCES users(id),
        assigned_agent_id INT REFERENCES users(id),
        
        -- QA Fields --
        qa_score INT DEFAULT NULL,
        qa_status VARCHAR(20) DEFAULT 'Pending',
        qa_remarks TEXT DEFAULT NULL,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        day_of_week VARCHAR(20) NOT NULL,
        time_slot VARCHAR(20) NOT NULL,
        fronter_id INT REFERENCES users(id),
        closer_id INT REFERENCES users(id),
        customer_id INT REFERENCES customers(id),
        status VARCHAR(20) DEFAULT 'Open', -- 'Open', 'Booked', 'Completed', 'Chase'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    
    // Seed default weekly slots if the appointments table is currently empty
    const checkSlots = await pool.query('SELECT COUNT(*) FROM appointments');
    if (parseInt(checkSlots.rows[0].count) === 0) {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const slots = [
        '9:15 AM', '10:15 AM', '11:30 AM', '12:45 PM',
        '1:45 PM', '3:00 PM', '4:15 PM', '5:00 PM'
      ];

      for (const day of days) {
        for (const slot of slots) {
          await pool.query(
            `INSERT INTO appointments (day_of_week, time_slot, status) VALUES ($1, $2, 'Open')`,
            [day, slot]
          );
        }
      }
      console.log('Default weekly appointment slots (Mon-Fri) seeded successfully!');
    }

    console.log('Tables "users", "customers", and "appointments" created successfully with scheduling support!');
    process.exit(0);
  } catch (err) {
    console.error('Error creating tables:', err.message);
    process.exit(1);
  }
};

createTables();