import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'
import { getAuth } from './auth/_jwt.js'

const VALID_ACTIVITY_TYPES = new Set(['hiking', 'running', 'cycling', 'skiing'])
const ROUTE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

function validateRoute(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'Invalid body'
  const b = r as Record<string, unknown>
  if (!b.id || typeof b.id !== 'string' || !ROUTE_ID_RE.test(b.id)) return 'Invalid id'
  if (!b.name || typeof b.name !== 'string' || b.name.length > 200) return 'Invalid name'
  if (!b.activityType || !VALID_ACTIVITY_TYPES.has(b.activityType as string)) return 'Invalid activityType'
  if (!Array.isArray(b.coordinates) || b.coordinates.length < 2) return 'Invalid coordinates'
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await setupDB()
    const pool = getPool()

    // GET — list all routes (public)
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM rutasmap_routes ORDER BY created_at DESC')
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
        if (ownerId && ownerId !== auth.sub && !auth.isAdmin) {
          return res.status(403).json({ error: 'No tienes permiso para editar esta ruta' })
        }
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
        [r.id, r.name, r.activityType,
         JSON.stringify(r.coordinates), JSON.stringify(r.waypoints ?? []),
         r.metrics ? JSON.stringify(r.metrics) : null,
         r.createdAt ? new Date(r.createdAt).toISOString() : null,
         r.color ?? null, r.description ?? null, JSON.stringify(r.tags ?? []),
         auth.sub]
      )
      return res.json({ ok: true })
    }

    // DELETE — delete all routes (admin only)
    if (req.method === 'DELETE') {
      const auth = getAuth(req)
      if (!auth?.isAdmin) return res.status(403).json({ error: 'Solo admins pueden borrar todas las rutas' })
      await pool.query('DELETE FROM rutasmap_routes')
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/routes]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
