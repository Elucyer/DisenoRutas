import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host:            process.env.DB_HOST?.trim(),
      user:            process.env.DB_USER?.trim(),
      password:        process.env.DB_PASSWORD?.trim(),
      port:            Number(process.env.DB_PORT) || 5432,
      database:        process.env.DB_NAME?.trim() || 'analisisstrava',
      ssl:             { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
      max:             3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis:       10000,
      statement_timeout:       8000,
    })
  }
  return pool
}

let dbReady = false

export async function setupDB() {
  if (dbReady) return
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS rutasmap_routes (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      coordinates   JSONB NOT NULL,
      waypoints     JSONB DEFAULT '[]',
      metrics       JSONB,
      created_at    TIMESTAMPTZ,
      color         TEXT,
      description   TEXT,
      tags          JSONB DEFAULT '[]'
    )
  `)
  dbReady = true
}
