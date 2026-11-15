import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from './_db.js'
import { getAuth } from './auth/_jwt.js'
import { randomUUID } from 'crypto'
import { firstParam, isLat, isLng } from './_http.js'

const HISTORY_LIMIT = 5
const RESULT_TYPE_RE = /^[a-z_]{1,40}$/
const UUID_RE = /^[0-9a-f-]{36}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = getAuth(req)
    if (!user) return res.status(401).json({ error: 'Login requerido' })

    await setupDB()
    const pool = getPool()

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT id, display_name, lat, lng, result_type
         FROM rutasmap_search_history
         WHERE user_id = $1
         ORDER BY searched_at DESC
         LIMIT ${HISTORY_LIMIT}`,
        [user.sub]
      )
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const { display_name, lat, lng, result_type } = req.body ?? {}
      if (typeof display_name !== 'string' || !display_name.trim()) return res.status(400).json({ error: 'Missing fields' })
      if (!isLat(lat) || !isLng(lng)) return res.status(400).json({ error: 'Invalid coordinates' })
      const type = typeof result_type === 'string' && RESULT_TYPE_RE.test(result_type) ? result_type : 'place'

      // Re-searching the same place moves it to the top instead of duplicating it
      await pool.query(
        'DELETE FROM rutasmap_search_history WHERE user_id = $1 AND display_name = $2',
        [user.sub, display_name.slice(0, 500)]
      )
      await pool.query(
        `INSERT INTO rutasmap_search_history (id, user_id, display_name, lat, lng, result_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), user.sub, display_name.slice(0, 500), lat, lng, type]
      )
      await pool.query(
        `DELETE FROM rutasmap_search_history
         WHERE user_id = $1 AND id NOT IN (
           SELECT id FROM rutasmap_search_history
           WHERE user_id = $1
           ORDER BY searched_at DESC
           LIMIT ${HISTORY_LIMIT}
         )`,
        [user.sub]
      )
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const id = firstParam(req.query.id)
      if (id) {
        if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' })
        await pool.query(
          'DELETE FROM rutasmap_search_history WHERE id = $1 AND user_id = $2',
          [id, user.sub]
        )
      } else {
        await pool.query('DELETE FROM rutasmap_search_history WHERE user_id = $1', [user.sub])
      }
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/search-history]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
