import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'
import { getAuth } from './auth/_jwt.js'
import { ID_RE, isLat, isLng } from './_http.js'

const VALID_ACTIVITY_TYPES = new Set(['hiking', 'running', 'cycling'])
const MAX_COORDS = 50_000
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

function validateRoute(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'Invalid body'
  const b = r as Record<string, unknown>
  if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return 'Invalid id'
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) return 'Invalid name'
  if (!VALID_ACTIVITY_TYPES.has(b.activityType as string)) return 'Invalid activityType'
  if (!Array.isArray(b.coordinates) || b.coordinates.length < 2 || b.coordinates.length > MAX_COORDS) return 'Invalid coordinates'
  for (const c of b.coordinates as Record<string, unknown>[]) {
    if (!c || !isLat(c.lat) || !isLng(c.lng)) return 'Invalid coordinates'
    if (c.elevation != null && (typeof c.elevation !== 'number' || !Number.isFinite(c.elevation))) return 'Invalid elevation'
  }
  if (b.waypoints != null && !Array.isArray(b.waypoints)) return 'Invalid waypoints'
  if (b.color != null && (typeof b.color !== 'string' || !COLOR_RE.test(b.color))) return 'Invalid color'
  if (b.description != null && (typeof b.description !== 'string' || b.description.length > 5000)) return 'Invalid description'
  if (b.tags != null && (!Array.isArray(b.tags) || b.tags.length > 30 || b.tags.some(t => typeof t !== 'string' || t.length > 50))) return 'Invalid tags'
  if (b.createdAt != null && (typeof b.createdAt !== 'number' || !Number.isFinite(b.createdAt))) return 'Invalid createdAt'
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await setupDB()
    const pool = getPool()

    // GET — list all routes (public)
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM rutasmap_routes ORDER BY created_at DESC NULLS LAST')
      return res.json(rows.map(r => ({
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
    }

    // POST — upsert route (requires auth)
    if (req.method === 'POST') {
      const auth = getAuth(req)
      if (!auth) return res.status(401).json({ error: 'Login requerido' })

      const validationError = validateRoute(req.body)
      if (validationError) return res.status(400).json({ error: validationError })
      const r = req.body

      // On conflict: only allow update if owner or admin
      const { rows: existing } = await pool.query(
        'SELECT user_id FROM rutasmap_routes WHERE id = $1', [r.id]
      )
      if (existing.length > 0) {
        const ownerId = existing[0].user_id
        if (ownerId !== auth.sub && !auth.isAdmin) {
          return res.status(403).json({ error: 'No tienes permiso para editar esta ruta' })
        }
      }

      // user_id is kept on update so an admin edit doesn't steal ownership
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
           tags          = EXCLUDED.tags,
           user_id       = COALESCE(rutasmap_routes.user_id, EXCLUDED.user_id)`,
        [r.id, r.name.trim(), r.activityType,
         JSON.stringify(r.coordinates), JSON.stringify(r.waypoints ?? []),
         r.metrics ? JSON.stringify(r.metrics) : null,
         r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
         r.color ?? null, r.description ?? null, JSON.stringify(r.tags ?? []),
         auth.sub]
      )
      return res.json({ ok: true })
    }

    // DELETE — delete all routes (admin only)
    if (req.method === 'DELETE') {
      const auth = getAuth(req)
      if (!auth?.isAdmin) return res.status(403).json({ error: 'Solo admins pueden borrar todas las rutas' })
      await pool.query('DELETE FROM rutasmap_waypoint_notes')
      await pool.query('DELETE FROM rutasmap_routes')
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/routes]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
