import { createHmac, timingSafeEqual } from 'crypto'

const IS_PROD = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret) return secret
  if (IS_PROD) throw new Error('JWT_SECRET no está configurado')
  return 'dev-secret-change-in-prod'
}

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
function sign(data: string) { return createHmac('sha256', getSecret()).update(data).digest('base64url') }

export function signToken(payload: Omit<JWTPayload, 'exp'>): string {
  const p: JWTPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify(p))
  return `${header}.${body}.${sign(`${header}.${body}`)}`
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = Buffer.from(sign(`${header}.${body}`))
    const given = Buffer.from(sig)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
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
