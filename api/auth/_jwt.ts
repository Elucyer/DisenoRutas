import { createHmac } from 'crypto'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod'

export interface JWTPayload {
  sub: string       // internal user id
  stravaId: number
  name: string
  pic?: string
  isAdmin: boolean
  exp: number
}

function b64u(s: string) { return Buffer.from(s).toString('base64url') }
function fromb64u(s: string) { return Buffer.from(s, 'base64url').toString('utf8') }

export function signToken(payload: Omit<JWTPayload, 'exp'>): string {
  const p: JWTPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify(p))
  const sig = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
    if (sig !== expected) return null
    const payload: JWTPayload = JSON.parse(fromb64u(body))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch { return null }
}

export function getAuth(req: { headers: Record<string, string | string[] | undefined> }): JWTPayload | null {
  const auth = req.headers['authorization']
  const header = Array.isArray(auth) ? auth[0] : auth
  if (!header?.startsWith('Bearer ')) return null
  return verifyToken(header.slice(7))
}
