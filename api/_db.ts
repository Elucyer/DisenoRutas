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
  const pool = getPool()
  await pool.query(`
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutasmap_users (
      id               TEXT PRIMARY KEY,
      strava_id        BIGINT UNIQUE,
      name             TEXT NOT NULL,
      profile_pic      TEXT,
      email            TEXT UNIQUE,
      password_hash    TEXT,
      is_admin         BOOLEAN DEFAULT false,
      access_token     TEXT,
      refresh_token    TEXT,
      token_expires_at BIGINT,
      created_at       TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`ALTER TABLE rutasmap_users ADD COLUMN IF NOT EXISTS password_hash TEXT`)
  await pool.query(`ALTER TABLE rutasmap_users ALTER COLUMN strava_id DROP NOT NULL`)
  await pool.query(`ALTER TABLE rutasmap_routes ADD COLUMN IF NOT EXISTS user_id TEXT`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutasmap_waypoint_notes (
      id         TEXT PRIMARY KEY,
      route_id   TEXT NOT NULL,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      comment    TEXT NOT NULL DEFAULT '',
      photo      TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
  dbReady = true
}
