import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_db.js'
import { getAuth } from '../auth/_jwt.js'

const ROUTE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const auth = getAuth(req)
    if (!auth) return res.status(401).json({ error: 'Login requerido' })

    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (!id || !ROUTE_ID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }

    const pool = getPool()
    const { rows } = await pool.query('SELECT user_id FROM rutasmap_routes WHERE id = $1', [id])
    if (rows.length === 0) return res.status(404).json({ error: 'Ruta no encontrada' })

    const ownerId = rows[0].user_id
    if (ownerId && ownerId !== auth.sub && !auth.isAdmin) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta ruta' })
    }

    await pool.query('DELETE FROM rutasmap_routes WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('[api/routes/[id]]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
