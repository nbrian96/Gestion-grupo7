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
      console.log('[DB Init] Esquema y datos semilla creados exitosamente en PostgreSQL.');
    } else {
      console.log('[DB Init] Las tablas principales ya existen. No es necesario reinstalar el esquema base.');
    }
  } catch (err) {
    console.error('[DB Init] Error durante la inicialización de la base de datos:', err);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

initDatabase();
