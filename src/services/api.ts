import { authHeader, useAuthStore } from '../store/authStore'

export const API_BASE = ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** fetch against our API with auth header + JSON; logs out on 401 so a stale token doesn't linger */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeader(), ...(init.headers as Record<string, string>) }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    if (res.status === 401 && headers.Authorization) useAuthStore.getState().logout()
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
