const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

function resolveSslConfig() {
  if (process.env.DATABASE_SSL === 'true') {
    return { rejectUnauthorized: false };
  }
  if (process.env.DATABASE_SSL === 'false') {
    return false;
  }
  if (!connectionString) {
    return false;
  }

  // Red local o red privada interna de Railway / Docker: no requieren SSL
  if (
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('.railway.internal') ||
    connectionString.includes('@db:')
  ) {
    return false;
  }

  // En producción con conexiones remotas públicas (ej. proxy externo Railway, Neon, Supabase)
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }

  return false;
}

const pool = new Pool({
  connectionString,
  ssl: resolveSslConfig(),
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

module.exports = { pool };
