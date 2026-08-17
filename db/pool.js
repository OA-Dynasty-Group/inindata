// Database connection pool management
const { Pool } = require('pg');

// Detect environment and adjust pool settings
const isProduction = process.env.NODE_ENV === 'production';
const isServerless = !!process.env.VERCEL; // True when running on Vercel
const isSsl = process.env.DATABASE_URL?.includes('?sslmode=') || isProduction;

// For Supabase: handle both direct and PgBouncer connection modes
// Direct mode: DATABASE_URL (default)
// PgBouncer mode (for Vercel): DATABASE_URL_PGBOUNCER (pool mode)
const connectionString = process.env.DATABASE_URL_PGBOUNCER || process.env.DATABASE_URL || 'postgresql://localhost/fieldwork';

// Pool configuration - reduced for serverless environments
const poolConfig = {
  connectionString,
  max: isServerless ? 1 : 20, // Vercel: 1 connection per function instance
  idleTimeoutMillis: isServerless ? 10000 : 30000,
  connectionTimeoutMillis: 5000,
  // SSL configuration for production/Supabase
  ...(isSsl && {
    ssl: {
      rejectUnauthorized: false, // Required for Supabase
    },
  }),
};

const pool = new Pool(poolConfig);

// Error handling with production logging
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
  if (process.env.NODE_ENV === 'production') {
    // In production, log but don't exit - let the request fail gracefully
    console.error('Stack trace:', err.stack);
  } else {
    process.exit(-1);
  }
});

/**
 * Execute a query with error handling
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`Query took ${duration}ms:`, text.substring(0, 50));
    }
    return result;
  } catch (error) {
    console.error('Query error:', error.message, '\nQuery:', text, '\nParams:', params);
    throw error;
  }
}

/**
 * Get a client for transactions
 */
async function getClient() {
  return pool.connect();
}

/**
 * Run a query within a transaction
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check with detailed diagnostics
 */
async function health() {
  try {
    const result = await query('SELECT version()');
    const version = result.rows[0]?.version || 'unknown';
    return { ok: true, database: version };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Close pool
 */
async function close() {
  return pool.end();
}

module.exports = { query, getClient, transaction, health, close };

// Diagnostic logging for connection mode (only log in non-serverless or startup)
if (!isServerless || process.env.DEBUG) {
  const mode = process.env.DATABASE_URL_PGBOUNCER ? 'PgBouncer' : 'Direct';
  const host = new URL(connectionString).hostname;
  console.log(`[DB] Mode: ${mode} | Host: ${host} | Serverless: ${isServerless}`);
}
