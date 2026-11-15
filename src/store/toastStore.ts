import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'error' | 'success' | 'info'
  message: string
}

interface ToastStore {
  toasts: Toast[]
  push: (kind: Toast['kind'], message: string) => void
  error: (message: string) => void
  success: (message: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastStore>()((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++
    set(state => ({ toasts: [...state.toasts.slice(-3), { id, kind, message }] }))
    setTimeout(() => get().dismiss(id), kind === 'error' ? 6000 : 3500)
  },
  error: (message) => get().push('error', message),
  success: (message) => get().push('success', message),
  dismiss: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}))
