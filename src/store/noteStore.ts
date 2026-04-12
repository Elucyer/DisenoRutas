import { create } from 'zustand'
import type { WaypointNote } from '../types/note'
import { nanoid } from '../utils/nanoid'

const API = import.meta.env.DEV ? '/strava-api' : ''

interface NoteStore {
  notes: WaypointNote[]
  loadNotes: (routeId: string) => Promise<void>
  saveNote: (note: Omit<WaypointNote, 'id' | 'createdAt'>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  clearNotes: () => void
}

export const useNoteStore = create<NoteStore>()((set, get) => ({
  notes: [],

  loadNotes: async (routeId) => {
    try {
      const res = await fetch(`${API}/api/notes?routeId=${routeId}`)
      if (!res.ok) return
      const notes: WaypointNote[] = await res.json()
      set({ notes })
    } catch (e) {
      console.error('Error cargando notas:', e)
    }
  },

  saveNote: async (partial) => {
    const note: WaypointNote = { ...partial, id: nanoid(), createdAt: Date.now() }
    set(state => ({ notes: [...state.notes, note] }))
    try {
      await fetch(`${API}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      })
    } catch (e) {
      console.error('Error guardando nota:', e)
    }
  },

  deleteNote: async (id) => {
    set(state => ({ notes: state.notes.filter(n => n.id !== id) }))
    try {
      await fetch(`${API}/api/notes/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error('Error eliminando nota:', e)
    }
  },

  clearNotes: () => set({ notes: [] }),
}))
