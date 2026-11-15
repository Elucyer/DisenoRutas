import { describe, it, expect } from 'vitest'
import { signToken, verifyToken, getAuth } from '../auth/_jwt.js'
import { readCookie, isLat, isLng, firstParam } from '../_http.js'

const payload = { sub: 'u1', stravaId: 42, name: 'Jánér Pérez', isAdmin: false }

describe('jwt', () => {
  it('round-trips a signed token (including non-ASCII names)', () => {
    const t = signToken(payload)
    expect(verifyToken(t)).toMatchObject(payload)
  })

  it('rejects a tampered payload', () => {
    const [h, , s] = signToken(payload).split('.')
    const forged = Buffer.from(JSON.stringify({ ...payload, isAdmin: true, exp: 9e9 })).toString('base64url')
    expect(verifyToken(`${h}.${forged}.${s}`)).toBeNull()
  })

  it('rejects malformed tokens and wrong signature length', () => {
    expect(verifyToken('abc')).toBeNull()
    const [h, b] = signToken(payload).split('.')
    expect(verifyToken(`${h}.${b}.short`)).toBeNull()
  })

  it('reads Bearer header', () => {
    const t = signToken(payload)
    expect(getAuth({ headers: { authorization: `Bearer ${t}` } })?.sub).toBe('u1')
    expect(getAuth({ headers: {} })).toBeNull()
  })
})

describe('http helpers', () => {
  it('parses cookies', () => {
    expect(readCookie('a=1; rutasmap_oauth_state=abc; b=2', 'rutasmap_oauth_state')).toBe('abc')
    expect(readCookie(undefined, 'x')).toBeUndefined()
  })

  it('validates coordinates', () => {
    expect(isLat(6.2)).toBe(true)
    expect(isLat(91)).toBe(false)
    expect(isLng('-75' as unknown)).toBe(false)
    expect(isLng(-180)).toBe(true)
  })

  it('firstParam unwraps arrays', () => {
    expect(firstParam(['a', 'b'])).toBe('a')
  })
})
