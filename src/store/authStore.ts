import { create } from 'zustand'

export interface AuthUser {
  id: string
  stravaId: number
  name: string
  pic?: string
  isAdmin: boolean
}

interface AuthStore {
  user: AuthUser | null
  token: string | null
  login: (token: string) => void
  logout: () => void
  isOwner: (routeUserId?: string | null) => boolean
}

function parseToken(token: string): AuthUser | null {
  try {
    const [, body] = token.split('.')
    // base64url → base64
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return {
      id: payload.sub,
      stravaId: payload.stravaId,
      name: payload.name,
      pic: payload.pic,
      isAdmin: payload.isAdmin,
    }
  } catch { return null }
}

const STORAGE_KEY = 'rutasmap_token'

// Storage can throw (blocked third-party storage inside iframes, private mode)
const storage = {
  get: () => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } },
  set: (v: string) => { try { localStorage.setItem(STORAGE_KEY, v) } catch { /* session-only */ } },
  remove: () => { try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ } },
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  token: null,

  login: (token) => {
    const user = parseToken(token)
    if (!user) return
    storage.set(token)
    set({ user, token })
  },

  logout: () => {
    storage.remove()
    set({ user: null, token: null })
  },

  isOwner: (routeUserId) => {
    const { user } = get()
    if (!user) return false
    if (user.isAdmin) return true
    if (!routeUserId) return false   // no owner set — only admin can delete
    return routeUserId === user.id
  },
}))

// Initialize from localStorage on module load
const stored = storage.get()
if (stored) {
  const user = parseToken(stored)
  if (user) useAuthStore.setState({ user, token: stored })
  else storage.remove()
}

/** Mirrors api/notes/[id].ts: note author, route owner or admin */
export function canDeleteNote(user: AuthUser | null, noteUserId?: string | null, routeUserId?: string | null): boolean {
  if (!user) return false
  return user.isAdmin || (!!noteUserId && noteUserId === user.id) || (!!routeUserId && routeUserId === user.id)
}

/** Returns Authorization header object if logged in */
export function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
