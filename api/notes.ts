import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'
import { getAuth } from './auth/_jwt.js'
import { ID_RE, firstParam, isLat, isLng } from './_http.js'

const MAX_COMMENT = 2000
const MAX_PHOTO_CHARS = 700_000   // ~500 KB base64 (client compresses well below this)
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await setupDB()
    const pool = getPool()

    // GET ?routeId=xxx (public)
    if (req.method === 'GET') {
      const routeId = firstParam(req.query.routeId)
      if (!routeId || !ID_RE.test(routeId)) return res.status(400).json({ error: 'routeId required' })
      const { rows } = await pool.query(
        'SELECT * FROM rutasmap_waypoint_notes WHERE route_id = $1 ORDER BY created_at ASC',
        [routeId]
      )
      return res.json(rows.map(r => ({
        id: r.id,
        routeId: r.route_id,
        lat: r.lat,
        lng: r.lng,
        comment: r.comment,
        photo: r.photo ?? undefined,
        createdAt: new Date(r.created_at).getTime(),
        userId: r.user_id ?? null,
      })))
    }

    // POST — create/update note (requires auth)
    if (req.method === 'POST') {
      const auth = getAuth(req)
      if (!auth) return res.status(401).json({ error: 'Login requerido' })

      const { id, routeId, lat, lng, comment = '', photo } = req.body ?? {}
      if (typeof id !== 'string' || !ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' })
      if (typeof routeId !== 'string' || !ID_RE.test(routeId)) return res.status(400).json({ error: 'Invalid routeId' })
      if (!isLat(lat) || !isLng(lng)) return res.status(400).json({ error: 'Invalid coordinates' })
      if (typeof comment !== 'string' || comment.length > MAX_COMMENT) return res.status(400).json({ error: 'Invalid comment' })
      if (photo != null && (typeof photo !== 'string' || photo.length > MAX_PHOTO_CHARS || !PHOTO_RE.test(photo))) {
        return res.status(400).json({ error: 'Invalid photo' })
      }
      if (!comment.trim() && !photo) return res.status(400).json({ error: 'Empty note' })

      const { rows: route } = await pool.query('SELECT 1 FROM rutasmap_routes WHERE id = $1', [routeId])
      if (route.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' })

      const { rows: existing } = await pool.query('SELECT user_id FROM rutasmap_waypoint_notes WHERE id = $1', [id])
      if (existing.length > 0 && existing[0].user_id !== auth.sub && !auth.isAdmin) {
        return res.status(403).json({ error: 'No tienes permiso para editar esta nota' })
      }

      await pool.query(
        `INSERT INTO rutasmap_waypoint_notes (id, route_id, lat, lng, comment, photo, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET comment = EXCLUDED.comment, photo = EXCLUDED.photo`,
        [id, routeId, lat, lng, comment, photo ?? null, auth.sub]
      )
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/notes]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
