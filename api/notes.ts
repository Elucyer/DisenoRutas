import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await setupDB()
    const pool = getPool()

    // GET ?routeId=xxx
    if (req.method === 'GET') {
      const { routeId } = req.query
      if (!routeId || typeof routeId !== 'string') return res.status(400).json({ error: 'routeId required' })
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
      })))
    }

    // POST — create note
    if (req.method === 'POST') {
      const { id, routeId, lat, lng, comment, photo } = req.body ?? {}
      if (!id || !routeId || lat == null || lng == null) return res.status(400).json({ error: 'Missing fields' })
      if (typeof comment !== 'string' || comment.length > 2000) return res.status(400).json({ error: 'Invalid comment' })
      await pool.query(
        `INSERT INTO rutasmap_waypoint_notes (id, route_id, lat, lng, comment, photo)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET comment = EXCLUDED.comment, photo = EXCLUDED.photo`,
        [id, routeId, lat, lng, comment ?? '', photo ?? null]
      )
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/notes]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
