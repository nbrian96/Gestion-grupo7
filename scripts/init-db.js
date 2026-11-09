require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function waitAndConnect(maxRetries = 5, delayMs = 3000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (err) {
      console.warn(`[DB Init] Intento ${attempt}/${maxRetries} de conexión fallido: ${err.message}`);
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function runPendingMigrations(client) {
  await ensureMigrationTable(client);

  const migrationsDir = path.join(__dirname, '..', 'sql', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file]
    );

    if (rows.length > 0) {
      console.log(`[DB Migrations] Omitiendo migración ya ejecutada: ${file}`);
      continue;
    }

    console.log(`[DB Migrations] Ejecutando migración: ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`[DB Migrations] Migración ${file} aplicada exitosamente.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[DB Migrations] Error al ejecutar migración ${file}:`, err.message);
      throw err;
    }
  }
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB Init] Advertencia: DATABASE_URL no está configurada. Omitiendo inicialización.');
    process.exit(0);
  }

  console.log('[DB Init] Verificando conexión a la base de datos...');
  let client;
  try {
    client = await waitAndConnect();
  } catch (err) {
    console.error('[DB Init] No se pudo establecer conexión con PostgreSQL:', err.message);
    process.exit(1);
  }

  try {
    const checkTable = await client.query(`
      SELECT to_regclass('public.members') AS table_exists;
    `);

    const tableExists = Boolean(checkTable.rows[0]?.table_exists);

    if (!tableExists) {
      console.log('[DB Init] Base de datos vacía detectada. Aplicando sql/schema.sql...');
      const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');

      await client.query(schemaSql);
      await ensureMigrationTable(client);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ('001_schema.sql') ON CONFLICT DO NOTHING;"
      );
      console.log('[DB Init] Esquema y datos semilla creados exitosamente en PostgreSQL.');
    } else {
      console.log('[DB Init] Las tablas principales ya existen.');
    }

    // Ejecutar migraciones pendientes automáticamente y una única vez
    await runPendingMigrations(client);

  } catch (err) {
    console.error('[DB Init] Error durante la inicialización de la base de datos:', err);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

initDatabase();
