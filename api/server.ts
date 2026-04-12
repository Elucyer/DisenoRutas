import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'

const app = express()

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:4173']

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }))
app.use(express.json({ limit: '1mb' }))

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'analisisstrava',
  ssl:      { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  max:      5,
})

// ── Setup tabla rutasmap_routes si no existe ──────────────────────────────────
async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutasmap_routes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      coordinates  JSONB NOT NULL,
      waypoints    JSONB DEFAULT '[]',
      metrics      JSONB,
      created_at   TIMESTAMPTZ,
      color        TEXT,
      description  TEXT,
      tags         JSONB DEFAULT '[]'
    );
  `)
}
setupDB().catch(console.error)

// ── Routes CRUD ───────────────────────────────────────────────────────────────

app.get('/api/routes', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM rutasmap_routes ORDER BY created_at DESC')
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      activityType: r.activity_type,
      coordinates: r.coordinates,
      waypoints: r.waypoints,
      metrics: r.metrics,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
      color: r.color,
      description: r.description,
      tags: r.tags,
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

const VALID_ACTIVITY_TYPES = new Set(['hiking', 'running', 'cycling', 'skiing'])
const ROUTE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

app.post('/api/routes', async (req, res) => {
  const r = req.body
  if (!r?.id || !ROUTE_ID_RE.test(r.id)) { res.status(400).json({ error: 'Invalid id' }); return }
  if (!r.name || typeof r.name !== 'string' || r.name.length > 200) { res.status(400).json({ error: 'Invalid name' }); return }
  if (!r.activityType || !VALID_ACTIVITY_TYPES.has(r.activityType)) { res.status(400).json({ error: 'Invalid activityType' }); return }
  if (!Array.isArray(r.coordinates) || r.coordinates.length < 2) { res.status(400).json({ error: 'Invalid coordinates' }); return }
  try {
    await pool.query(
      `INSERT INTO rutasmap_routes (id, name, activity_type, coordinates, waypoints, metrics, created_at, color, description, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name          = EXCLUDED.name,
         activity_type = EXCLUDED.activity_type,
         coordinates   = EXCLUDED.coordinates,
         waypoints     = EXCLUDED.waypoints,
         metrics       = EXCLUDED.metrics,
         color         = EXCLUDED.color,
         description   = EXCLUDED.description,
         tags          = EXCLUDED.tags`,
      [r.id, r.name, r.activityType, JSON.stringify(r.coordinates), JSON.stringify(r.waypoints ?? []),
       r.metrics ? JSON.stringify(r.metrics) : null,
       r.createdAt ? new Date(r.createdAt).toISOString() : null,
       r.color, r.description ?? null, JSON.stringify(r.tags ?? [])]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

app.delete('/api/routes/:id', async (req, res) => {
  if (!ROUTE_ID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid id' }); return }
  try {
    await pool.query('DELETE FROM rutasmap_routes WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

app.delete('/api/routes', async (_req, res) => {
  try {
    await pool.query('DELETE FROM rutasmap_routes')
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

// ── Strava ────────────────────────────────────────────────────────────────────

// GET /api/strava/routes — actividades con polyline para importar en RutasMap
app.get('/api/strava/routes', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sport_type, type, start_date_local,
              distance, moving_time, total_elevation_gain,
              elev_high, elev_low, summary_polyline
       FROM strava_activities
       WHERE summary_polyline IS NOT NULL AND summary_polyline != ''
       ORDER BY start_date_local DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error('DB error:', err)
    res.status(500).json({ error: 'Error al consultar la base de datos' })
  }
})

// GET /api/strava/status — siempre conectado (leemos directo de DB)
app.get('/api/strava/status', (_req, res) => {
  res.json({ connected: true })
})

const port = Number(process.env.API_PORT) || 3002
app.listen(port, () => {
  console.log(`RutasMap API running on http://localhost:${port}`)
  setInterval(() => pool.query('SELECT 1').catch(() => {}), 4 * 60 * 1000)
})
