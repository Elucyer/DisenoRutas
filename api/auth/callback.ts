import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool, setupDB } from '../_db.js'
import { signToken } from './_jwt.js'
import { randomUUID } from 'crypto'
import { OAUTH_STATE_COOKIE, firstParam, readCookie, parseAdminEmails, parseAdminStravaIds } from '../_http.js'

interface StravaTokenResponse {
  athlete?: { id: number; firstname?: string; lastname?: string; email?: string; profile_medium?: string }
  access_token: string
  refresh_token: string
  expires_at: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5180'
  const fail = (reason: string) => res.redirect(`${frontendUrl}#auth_error=${reason}`)

  // Clear the one-time state cookie regardless of outcome
  res.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`)

  try {
    const code = firstParam(req.query.code)
    const state = firstParam(req.query.state)
    if (req.query.error || !code) return fail('access_denied')

    const expectedState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE)
    if (!state || !expectedState || state !== expectedState) return fail('invalid_state')

    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    const data = await tokenRes.json() as StravaTokenResponse
    if (!data.athlete) return fail('strava_error')

    const { athlete, access_token, refresh_token, expires_at } = data
    const stravaId: number = athlete.id
    const name = `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}`.trim() || 'Atleta'
    const email: string | undefined = athlete.email
    const pic: string | undefined = athlete.profile_medium

    const isAdmin =
      parseAdminStravaIds().includes(stravaId) ||
      (email ? parseAdminEmails().includes(email.toLowerCase()) : false)

    await setupDB()
    const pool = getPool()

    const { rows } = await pool.query(
      `INSERT INTO rutasmap_users (id, strava_id, name, profile_pic, email, is_admin, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (strava_id) DO UPDATE SET
         name             = EXCLUDED.name,
         profile_pic      = EXCLUDED.profile_pic,
         email            = COALESCE(EXCLUDED.email, rutasmap_users.email),
         access_token     = EXCLUDED.access_token,
         refresh_token    = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         is_admin         = rutasmap_users.is_admin OR EXCLUDED.is_admin
       RETURNING id, name, profile_pic, is_admin`,
      [randomUUID(), stravaId, name, pic ?? null, email ?? null, isAdmin, access_token, refresh_token, expires_at]
    )
    const user = rows[0]

    const token = signToken({
      sub: user.id,
      stravaId,
      name: user.name,
      pic: user.profile_pic ?? undefined,
      isAdmin: user.is_admin,
    })

    // Fragment (#) is never sent to servers, logs or Referer headers
    res.redirect(`${frontendUrl}#token=${token}`)
  } catch (err) {
    console.error('[auth/callback]', err)
    fail('server_error')
  }
}
