import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_db.js'

const NOTE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (!id || !NOTE_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' })
    await getPool().query('DELETE FROM rutasmap_waypoint_notes WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('[api/notes/[id]]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
