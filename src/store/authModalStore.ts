import { create } from 'zustand'

interface AuthModalStore {
  open: boolean
  show: () => void
  hide: () => void
}

export const useAuthModalStore = create<AuthModalStore>()(set => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
