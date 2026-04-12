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
    const payload = JSON.parse(atob(b64))
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

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  token: null,

  login: (token) => {
    const user = parseToken(token)
    if (!user) return
    localStorage.setItem(STORAGE_KEY, token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
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
const stored = localStorage.getItem(STORAGE_KEY)
if (stored) {
  const user = parseToken(stored)
  if (user) useAuthStore.setState({ user, token: stored })
  else localStorage.removeItem(STORAGE_KEY)
}

/** Returns Authorization header object if logged in */
export function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
