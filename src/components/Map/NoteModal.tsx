import { useState, useRef } from 'react'
import { useNoteStore } from '../../store/noteStore'
import { compressImage } from '../../utils/imageCompress'
import type { WaypointNote } from '../../types/note'

interface AddNoteModalProps {
  routeId: string
  lat: number
  lng: number
  onClose: () => void
}

export function AddNoteModal({ routeId, lat, lng, onClose }: AddNoteModalProps) {
  const { saveNote } = useNoteStore()
  const [comment, setComment] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const compressed = await compressImage(file)
      setPhoto(compressed)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!comment.trim() && !photo) return
    await saveNote({ routeId, lat, lng, comment: comment.trim(), photo })
    onClose()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center pb-6 px-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white font-semibold text-sm">📍 Nueva nota</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>

        <p className="text-gray-600 text-[10px]">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>

        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Escribe un comentario o recordatorio..."
          rows={3}
          autoFocus
          className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-orange-500/50 resize-none transition-colors"
        />

        {photo ? (
          <div className="relative">
            <img src={photo} alt="preview" className="w-full h-32 object-cover rounded-lg" />
            <button
              onClick={() => setPhoto(undefined)}
              className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-500/80"
            >×</button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="w-full py-2 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : '📷'}
            {loading ? 'Procesando...' : 'Añadir foto'}
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs border border-white/10 text-gray-400 hover:bg-white/5 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!comment.trim() && !photo}
            className="flex-1 py-2 rounded-lg text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium transition-all"
          >
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  )
}

interface ViewNoteModalProps {
  note: WaypointNote
  onClose: () => void
}

export function ViewNoteModal({ note, onClose }: ViewNoteModalProps) {
  const { deleteNote } = useNoteStore()

  const handleDelete = async () => {
    await deleteNote(note.id)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center pb-6 px-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white font-semibold text-sm">📍 Nota</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
        </div>

        <p className="text-gray-600 text-[10px]">
          {new Date(note.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>

        {note.photo && (
          <img src={note.photo} alt="nota" className="w-full h-40 object-cover rounded-lg" />
        )}

        {note.comment && (
          <p className="text-gray-300 text-sm leading-relaxed">{note.comment}</p>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs border border-white/10 text-gray-400 hover:bg-white/5 transition-all">
            Cerrar
          </button>
          <button
            onClick={handleDelete}
            className="py-2 px-4 rounded-lg text-xs bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all"
          >
            🗑️ Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
