import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'
import { getAuth } from './auth/_jwt.js'
import { randomUUID } from 'crypto'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await setupDB()
    const pool = getPool()
    const user = getAuth(req)
    if (!user) return res.status(401).json({ error: 'Login requerido' })

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT id, display_name, lat, lng, result_type
         FROM rutasmap_search_history
         WHERE user_id = $1
         ORDER BY searched_at DESC
         LIMIT 5`,
        [user.sub]
      )
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { display_name, lat, lng, result_type } = req.body ?? {}
      if (!display_name || lat == null || lng == null) return res.status(400).json({ error: 'Missing fields' })
      const id = randomUUID()
      await pool.query(
        `INSERT INTO rutasmap_search_history (id, user_id, display_name, lat, lng, result_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, user.sub, String(display_name).slice(0, 500), Number(lat), Number(lng), result_type || 'place']
      )
      await pool.query(
        `DELETE FROM rutasmap_search_history
         WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM rutasmap_search_history
           WHERE user_id = $1
           ORDER BY searched_at DESC
           LIMIT 5
         )`,
        [user.sub]
      )
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM rutasmap_search_history WHERE user_id = $1', [user.sub])
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/search-history]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
