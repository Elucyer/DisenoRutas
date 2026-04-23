import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'
import { createHmac, randomUUID } from 'crypto'

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

// ── Setup tablas ──────────────────────────────────────────────────────────────
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
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutasmap_users (
      id               TEXT PRIMARY KEY,
      strava_id        BIGINT UNIQUE,
      name             TEXT NOT NULL,
      profile_pic      TEXT,
      email            TEXT,
      password_hash    TEXT,
      is_admin         BOOLEAN DEFAULT FALSE,
      access_token     TEXT,
      refresh_token    TEXT,
      token_expires_at BIGINT
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rutasmap_search_history (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      display_name TEXT NOT NULL,
      lat          DOUBLE PRECISION NOT NULL,
      lng          DOUBLE PRECISION NOT NULL,
      result_type  TEXT NOT NULL DEFAULT 'place',
      searched_at  TIMESTAMPTZ DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_search_history_user ON rutasmap_search_history(user_id, searched_at DESC)`)
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
      userId: r.user_id ?? null,
    })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

const VALID_ACTIVITY_TYPES = new Set(['hiking', 'running', 'cycling', 'skiing'])
const ROUTE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

app.post('/api/routes', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  const r = req.body
  if (!r?.id || !ROUTE_ID_RE.test(r.id)) { res.status(400).json({ error: 'Invalid id' }); return }
  if (!r.name || typeof r.name !== 'string' || r.name.length > 200) { res.status(400).json({ error: 'Invalid name' }); return }
  if (!r.activityType || !VALID_ACTIVITY_TYPES.has(r.activityType)) { res.status(400).json({ error: 'Invalid activityType' }); return }
  if (!Array.isArray(r.coordinates) || r.coordinates.length < 2) { res.status(400).json({ error: 'Invalid coordinates' }); return }
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM rutasmap_routes WHERE id=$1', [r.id])
    if (existing.length > 0) {
      const ownerId = existing[0].user_id
      if (ownerId && ownerId !== auth.sub && !auth.isAdmin) { res.status(403).json({ error: 'Sin permiso' }); return }
    }
    await pool.query(
      `INSERT INTO rutasmap_routes (id, name, activity_type, coordinates, waypoints, metrics, created_at, color, description, tags, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
       r.color, r.description ?? null, JSON.stringify(r.tags ?? []), auth.sub]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB error' })
  }
})

app.delete('/api/routes/:id', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  if (!ROUTE_ID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid id' }); return }
  try {
    const { rows } = await pool.query('SELECT user_id FROM rutasmap_routes WHERE id=$1', [req.params.id])
    if (rows.length === 0) { res.status(404).json({ error: 'Ruta no encontrada' }); return }
    const ownerId = rows[0].user_id
    if (ownerId && ownerId !== auth.sub && !auth.isAdmin) { res.status(403).json({ error: 'Sin permiso' }); return }
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

// ── Waypoint Notes ────────────────────────────────────────────────────────────

app.get('/api/notes', async (req, res) => {
  const { routeId } = req.query
  if (!routeId || typeof routeId !== 'string') { res.status(400).json({ error: 'routeId required' }); return }
  try {
    const { rows } = await pool.query(
      'SELECT * FROM rutasmap_waypoint_notes WHERE route_id = $1 ORDER BY created_at ASC',
      [routeId]
    )
    res.json(rows.map(r => ({
      id: r.id, routeId: r.route_id, lat: r.lat, lng: r.lng,
      comment: r.comment, photo: r.photo ?? undefined,
      createdAt: new Date(r.created_at).getTime(),
    })))
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

app.post('/api/notes', async (req, res) => {
  const { id, routeId, lat, lng, comment, photo } = req.body ?? {}
  if (!id || !routeId || lat == null || lng == null) { res.status(400).json({ error: 'Missing fields' }); return }
  try {
    await pool.query(
      `INSERT INTO rutasmap_waypoint_notes (id, route_id, lat, lng, comment, photo)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET comment=EXCLUDED.comment, photo=EXCLUDED.photo`,
      [id, routeId, lat, lng, comment ?? '', photo ?? null]
    )
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM rutasmap_waypoint_notes WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

// ── Search History ────────────────────────────────────────────────────────────

app.get('/api/search-history', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  try {
    const { rows } = await pool.query(
      `SELECT id, display_name, lat, lng, result_type
       FROM rutasmap_search_history
       WHERE user_id = $1
       ORDER BY searched_at DESC
       LIMIT 5`,
      [auth.sub]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

app.post('/api/search-history', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  const { display_name, lat, lng, result_type } = req.body ?? {}
  if (!display_name || lat == null || lng == null) { res.status(400).json({ error: 'Missing fields' }); return }
  try {
    const id = crypto.randomUUID()
    await pool.query(
      `INSERT INTO rutasmap_search_history (id, user_id, display_name, lat, lng, result_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, auth.sub, String(display_name).slice(0, 500), Number(lat), Number(lng), result_type || 'place']
    )
    // Keep only last 5 per user
    await pool.query(
      `DELETE FROM rutasmap_search_history
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM rutasmap_search_history
         WHERE user_id = $1
         ORDER BY searched_at DESC
         LIMIT 5
       )`,
      [auth.sub]
    )
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

app.delete('/api/search-history/:id', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  try {
    await pool.query(
      'DELETE FROM rutasmap_search_history WHERE id = $1 AND user_id = $2',
      [req.params.id, auth.sub]
    )
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

app.delete('/api/search-history', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) { res.status(401).json({ error: 'Login requerido' }); return }
  try {
    await pool.query('DELETE FROM rutasmap_search_history WHERE user_id = $1', [auth.sub])
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: 'DB error' }) }
})

// ── Auth ─────────────────────────────────────────────────────────────────────

function signDevToken(payload: Record<string, unknown>): string {
  const secret = process.env.JWT_SECRET || 'dev-secret'
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function getDevAuth(req: express.Request): { sub: string; isAdmin: boolean } | null {
  const authz = req.headers.authorization
  if (!authz?.startsWith('Bearer ')) return null
  try {
    const [, body] = authz.slice(7).split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return { sub: payload.sub, isAdmin: payload.isAdmin }
  } catch { return null }
}

const ADMIN_STRAVA_IDS: number[] = process.env.ADMIN_STRAVA_ID
  ? process.env.ADMIN_STRAVA_ID.split(',').map(Number)
  : []
const ADMIN_EMAILS = ['janer.jpm@gmail.com']

app.get('/api/auth/strava', (_req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID
  const redirectUri = encodeURIComponent('http://localhost:3002/api/auth/callback')
  const scope = 'read,activity:read_all'
  res.redirect(`https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`)
})

app.get('/api/auth/callback', async (req, res) => {
  const frontendUrl = 'http://localhost:5173'
  const { code, error } = req.query
  if (error || !code) return res.redirect(`${frontendUrl}?auth_error=access_denied`)

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: Array.isArray(code) ? code[0] : code,
        grant_type: 'authorization_code',
      }),
    })
    const data = await tokenRes.json()
    if (!data.athlete) return res.redirect(`${frontendUrl}?auth_error=strava_error`)

    const { athlete, access_token, refresh_token, expires_at } = data
    const stravaId: number = athlete.id
    const name = `${athlete.firstname} ${athlete.lastname}`.trim()
    const email: string | undefined = athlete.email
    const pic: string | undefined = athlete.profile_medium
    const isAdmin = ADMIN_STRAVA_IDS.includes(stravaId) || (email ? ADMIN_EMAILS.includes(email) : false)

    await pool.query(`
      INSERT INTO rutasmap_users (id, strava_id, name, profile_pic, email, is_admin, access_token, refresh_token, token_expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (strava_id) DO UPDATE SET
        name=$3, profile_pic=$4, email=COALESCE($5, rutasmap_users.email),
        access_token=$7, refresh_token=$8, token_expires_at=$9,
        is_admin=rutasmap_users.is_admin OR $6`,
      [randomUUID(), stravaId, name, pic ?? null, email ?? null, isAdmin, access_token, refresh_token, expires_at]
    )
    const { rows } = await pool.query('SELECT * FROM rutasmap_users WHERE strava_id=$1', [stravaId])
    const user = rows[0]
    const token = signDevToken({
      sub: user.id, stravaId, name: user.name, pic: user.profile_pic ?? undefined,
      isAdmin: user.is_admin, exp: Math.floor(Date.now() / 1000) + 30 * 86400,
    })
    res.redirect(`${frontendUrl}?token=${token}`)
  } catch (err) {
    console.error('[auth/callback]', err)
    res.redirect(`${frontendUrl}?auth_error=server_error`)
  }
})

app.get('/api/auth/me', (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })
  res.json(auth)
})

// ── Strava per-user activities ────────────────────────────────────────────────

app.get('/api/strava/user-activities', async (req, res) => {
  const auth = getDevAuth(req)
  if (!auth) return res.status(401).json({ error: 'Login requerido' })

  try {
    const { rows } = await pool.query('SELECT * FROM rutasmap_users WHERE id=$1', [auth.sub])
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' })

    let accessToken = user.access_token
    if (user.token_expires_at <= Math.floor(Date.now() / 1000) + 300) {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: user.refresh_token,
        }),
      })
      const data = await r.json()
      if (!data.access_token) return res.status(401).json({ error: 'Token inválido, vuelve a conectar' })
      await pool.query(
        'UPDATE rutasmap_users SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE id=$4',
        [data.access_token, data.refresh_token, data.expires_at, auth.sub]
      )
      accessToken = data.access_token
    }

    const page = Number(req.query.page) || 1
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!stravaRes.ok) return res.status(502).json({ error: 'Error al consultar Strava' })
    const activities = await stravaRes.json()
    res.json(activities
      .map((a: Record<string, unknown>) => ({
        id: a.id, name: a.name, sport_type: a.sport_type, type: a.type,
        start_date_local: a.start_date_local, distance: a.distance,
        moving_time: a.moving_time, total_elevation_gain: a.total_elevation_gain,
        elev_high: a.elev_high, elev_low: a.elev_low,
        summary_polyline: (a.map as Record<string, unknown>)?.summary_polyline ?? null,
      }))
      .filter((a: Record<string, unknown>) => a.summary_polyline)
    )
  } catch (err) {
    console.error('[strava/user-activities]', err)
    res.status(500).json({ error: 'Internal server error' })
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
