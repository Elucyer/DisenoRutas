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
      // DB_SSL=false for a local Postgres (Docker) without TLS; managed DBs keep SSL on
      ssl:             process.env.DB_SSL === 'false'
        ? false
        : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
      max:             3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis:       10000,
      statement_timeout:       8000,
    })
  }
  return pool
}

let dbReady: Promise<void> | null = null

// Idempotent schema setup, sent as a single multi-statement query (one round trip per cold start)
export function setupDB(): Promise<void> {
  if (!dbReady) {
    dbReady = getPool().query(SCHEMA_SQL).then(() => undefined)
    dbReady.catch(() => { dbReady = null })
  }
  return dbReady
}

const SCHEMA_SQL = `
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
    );
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
    );
    ALTER TABLE rutasmap_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE rutasmap_users ALTER COLUMN strava_id DROP NOT NULL;
    ALTER TABLE rutasmap_routes ADD COLUMN IF NOT EXISTS user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_routes_created ON rutasmap_routes(created_at DESC);
    CREATE TABLE IF NOT EXISTS rutasmap_waypoint_notes (
      id         TEXT PRIMARY KEY,
      route_id   TEXT NOT NULL,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      comment    TEXT NOT NULL DEFAULT '',
      photo      TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE rutasmap_waypoint_notes ADD COLUMN IF NOT EXISTS user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_notes_route ON rutasmap_waypoint_notes(route_id, created_at);
    CREATE TABLE IF NOT EXISTS rutasmap_search_history (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      display_name TEXT NOT NULL,
      lat        DOUBLE PRECISION NOT NULL,
      lng        DOUBLE PRECISION NOT NULL,
      result_type TEXT NOT NULL DEFAULT 'place',
      searched_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_search_history_user ON rutasmap_search_history(user_id, searched_at DESC);
`
