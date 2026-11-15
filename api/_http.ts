export const OAUTH_STATE_COOKIE = 'rutasmap_oauth_state'
export const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function isLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
}

export function isLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180
}

export function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export function parseAdminStravaIds(): number[] {
  return (process.env.ADMIN_STRAVA_ID ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
}
