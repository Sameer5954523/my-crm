const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: 'postgres' // Connects to default postgres database first
});

async function makeDb() {
  try {
    await client.connect();
    await client.query('CREATE DATABASE crm_db;');
    console.log('Database "crm_db" created successfully!');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('Database "crm_db" already exists.');
    } else {
      console.error('Error creating database:', err.message);
    }
  } finally {
    await client.end();
  }
}

makeDb();