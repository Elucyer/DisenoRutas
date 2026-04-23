import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_db.js'
import { getAuth } from '../auth/_jwt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const user = getAuth(req)
    if (!user) return res.status(401).json({ error: 'Login requerido' })
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (!id) return res.status(400).json({ error: 'Missing id' })
    await getPool().query(
      'DELETE FROM rutasmap_search_history WHERE id = $1 AND user_id = $2',
      [id, user.sub]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[api/search-history/[id]]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
