import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.STRAVA_CLIENT_ID
  if (!clientId) return res.status(500).json({ error: 'STRAVA_CLIENT_ID not configured' })

  const appUrl = process.env.APP_URL || 'http://localhost:3002'
  const redirectUri = `${appUrl}/api/auth/callback`
  const scope = 'read,activity:read_all'
  const state = Math.random().toString(36).slice(2)

  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', state)

  res.redirect(url.toString())
}
