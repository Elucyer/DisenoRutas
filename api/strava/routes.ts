import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_db.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, sport_type, type, start_date_local,
              distance, moving_time, total_elevation_gain,
              elev_high, elev_low, summary_polyline
       FROM strava_activities
       WHERE summary_polyline IS NOT NULL AND summary_polyline != ''
       ORDER BY start_date_local DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error('[api/strava/routes]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
