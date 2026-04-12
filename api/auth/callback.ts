import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from '../_db.js'
import { signToken } from './_jwt.js'
import { randomUUID } from 'crypto'

const ADMIN_STRAVA_IDS: number[] = process.env.ADMIN_STRAVA_ID
  ? process.env.ADMIN_STRAVA_ID.split(',').map(Number)
  : []
const ADMIN_EMAILS = ['janer.jpm@gmail.com']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  try {
    const { code, error } = req.query
    if (error || !code) return res.redirect(`${frontendUrl}?auth_error=access_denied`)

    // Exchange code for Strava token
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: Array.isArray(code) ? code[0] : code,
        grant_type: 'authorization_code',
      }),
    })

    const data = await tokenRes.json()
    if (!data.athlete) return res.redirect(`${frontendUrl}?auth_error=strava_error`)

    const { athlete, access_token, refresh_token, expires_at } = data
    const stravaId: number = athlete.id
    const name = `${athlete.firstname} ${athlete.lastname}`.trim()
    const email: string | undefined = athlete.email
    const pic: string | undefined = athlete.profile_medium

    const isAdmin =
      ADMIN_STRAVA_IDS.includes(stravaId) ||
      (email ? ADMIN_EMAILS.includes(email) : false)

    await setupDB()
    const pool = getPool()

    // Upsert user
    await pool.query(
      `INSERT INTO rutasmap_users (id, strava_id, name, profile_pic, email, is_admin, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (strava_id) DO UPDATE SET
         name             = EXCLUDED.name,
         profile_pic      = EXCLUDED.profile_pic,
         email            = COALESCE(EXCLUDED.email, rutasmap_users.email),
         access_token     = EXCLUDED.access_token,
         refresh_token    = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         is_admin         = rutasmap_users.is_admin OR EXCLUDED.is_admin`,
      [randomUUID(), stravaId, name, pic ?? null, email ?? null, isAdmin, access_token, refresh_token, expires_at]
    )

    const { rows } = await pool.query('SELECT * FROM rutasmap_users WHERE strava_id = $1', [stravaId])
    const user = rows[0]

    const token = signToken({
      sub: user.id,
      stravaId,
      name: user.name,
      pic: user.profile_pic ?? undefined,
      isAdmin: user.is_admin,
    })

    res.redirect(`${frontendUrl}?token=${token}`)
  } catch (err) {
    console.error('[auth/callback]', err)
    res.redirect(`${frontendUrl}?auth_error=server_error`)
  }
}
