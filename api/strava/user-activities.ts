import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from '../_db.js'
import { getAuth } from '../auth/_jwt.js'

async function getValidToken(userId: string): Promise<string | null> {
  const pool = getPool()
  const { rows } = await pool.query('SELECT * FROM rutasmap_users WHERE id = $1', [userId])
  const user = rows[0]
  if (!user) return null

  // Token still valid (with 5 min buffer)
  if (user.token_expires_at > Math.floor(Date.now() / 1000) + 300) {
    return user.access_token
  }

  // Refresh
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: user.refresh_token,
    }),
  })
  const data = await res.json()
  if (!data.access_token) return null

  await pool.query(
    'UPDATE rutasmap_users SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE id=$4',
    [data.access_token, data.refresh_token, data.expires_at, userId]
  )
  return data.access_token
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = getAuth(req)
  if (!auth) return res.status(401).json({ error: 'Login requerido' })

  try {
    await setupDB()
    const accessToken = await getValidToken(auth.sub)
    if (!accessToken) return res.status(401).json({ error: 'Token de Strava inválido, vuelve a conectar' })

    const page = Number(req.query.page) || 1
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!stravaRes.ok) return res.status(502).json({ error: 'Error al consultar Strava' })

    const activities = await stravaRes.json()
    res.json(activities.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name,
      sport_type: a.sport_type,
      type: a.type,
      start_date_local: a.start_date_local,
      distance: a.distance,
      moving_time: a.moving_time,
      total_elevation_gain: a.total_elevation_gain,
      elev_high: a.elev_high,
      elev_low: a.elev_low,
      summary_polyline: (a.map as Record<string, unknown>)?.summary_polyline ?? null,
    })).filter((a: Record<string, unknown>) => a.summary_polyline))
  } catch (err) {
    console.error('[strava/user-activities]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
