import { create } from 'zustand'
import type { WaypointNote } from '../types/note'
import { nanoid } from '../utils/nanoid'
import { apiFetch } from '../services/api'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'

interface NoteStore {
  notes: WaypointNote[]
  loadNotes: (routeId: string) => Promise<void>
  saveNote: (note: Omit<WaypointNote, 'id' | 'createdAt' | 'userId'>) => Promise<boolean>
  deleteNote: (id: string) => Promise<void>
  clearNotes: () => void
}

export const useNoteStore = create<NoteStore>()((set, get) => ({
  notes: [],

  loadNotes: async (routeId) => {
    try {
      const notes = await apiFetch<WaypointNote[]>(`/api/notes?routeId=${encodeURIComponent(routeId)}`)
      set({ notes })
    } catch (e) {
      console.error('Error cargando notas:', e)
    }
  },

  saveNote: async (partial) => {
    const note: WaypointNote = {
      ...partial,
      id: nanoid(),
      createdAt: Date.now(),
      userId: useAuthStore.getState().user?.id ?? null,
    }
    set(state => ({ notes: [...state.notes, note] }))
    try {
      await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(note) })
      return true
    } catch (e) {
      set(state => ({ notes: state.notes.filter(n => n.id !== note.id) }))
      useToastStore.getState().error(`No se pudo guardar la nota: ${(e as Error).message}`)
      return false
    }
  },

  deleteNote: async (id) => {
    const previous = get().notes
    set({ notes: previous.filter(n => n.id !== id) })
    try {
      await apiFetch(`/api/notes/${id}`, { method: 'DELETE' })
    } catch (e) {
      set({ notes: previous })
      useToastStore.getState().error(`No se pudo eliminar la nota: ${(e as Error).message}`)
    }
  },

  clearNotes: () => set({ notes: [] }),
}))
