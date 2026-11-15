import { useCallback, useRef } from 'react'
import { parseGPX } from '../../utils/gpxParser'
import { calculateMetrics } from '../../utils/routeMetrics'
import { useRouteStore } from '../../store/routeStore'
import { useAuthStore } from '../../store/authStore'
import { useAuthModalStore } from '../../store/authModalStore'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useToastStore } from '../../store/toastStore'
import type { Route } from '../../types/route'

const MAX_GPX_BYTES = 20 * 1024 * 1024

export function GpxDropZone() {
  const { saveRoute } = useRouteStore()
  const user = useAuthStore(s => s.user)
  const showAuthModal = useAuthModalStore(s => s.show)
  const isMobile = useIsMobile()
  const activeRouteId = useRouteStore(s => s.activeRouteId)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    const nameOk = file.name.toLowerCase().endsWith('.gpx')
    const typeOk = !file.type || file.type === 'application/gpx+xml' || file.type === 'application/xml' || file.type === 'text/xml'
    const toast = useToastStore.getState()
    if (!nameOk || !typeOk) { toast.error(`"${file.name}" no es un archivo .gpx`); return }
    if (file.size > MAX_GPX_BYTES) { toast.error(`"${file.name}" supera 20 MB`); return }
    const reader = new FileReader()
    reader.onerror = () => toast.error(`No se pudo leer "${file.name}"`)
    reader.onload = e => {
      const text = e.target?.result as string
      let partial: Partial<Route>
      try {
        partial = parseGPX(text)
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`)
        return
      }
      if (!partial.coordinates || partial.coordinates.length < 2) return

      const route: Route = {
        id: partial.id!,
        name: partial.name!,
        activityType: partial.activityType!,
        coordinates: partial.coordinates,
        waypoints: partial.waypoints ?? [],
        color: partial.color!,
        tags: [],
        createdAt: partial.createdAt ?? Date.now(),
        metrics: calculateMetrics(partial.coordinates, partial.activityType!),
      }
      saveRoute(route)
      toast.success(`Ruta "${route.name}" importada`)
    }
    reader.readAsText(file)
  }, [saveRoute])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!user) { showAuthModal(); return }
    Array.from(e.dataTransfer.files).forEach(processFile)
  }, [processFile, user, showAuthModal])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      className={`absolute z-10 ${
        isMobile
          ? activeRouteId ? 'bottom-36 right-4' : 'bottom-20 right-4'
          : 'bottom-4 left-1/2 -translate-x-1/2'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        multiple
        className="hidden"
        onChange={e => {
          Array.from(e.target.files ?? []).forEach(processFile)
          e.target.value = ''  // allow re-importing the same file
        }}
      />
      {isMobile ? (
        <button
          onClick={() => { if (!user) { showAuthModal(); return } inputRef.current?.click() }}
          className="w-10 h-10 rounded-xl bg-gray-900/95 border border-white/10 hover:border-orange-500/50 shadow-lg flex items-center justify-center text-base backdrop-blur transition-all"
          aria-label="Importar GPX"
        >
          📂
        </button>
      ) : (
        <button
          onClick={() => { if (!user) { showAuthModal(); return } inputRef.current?.click() }}
          className="bg-gray-900/90 backdrop-blur border border-white/10 hover:border-orange-500/50 rounded-xl px-4 py-2 text-gray-400 hover:text-orange-400 text-xs font-medium transition-all flex items-center gap-2 shadow-lg"
        >
          <span>📂</span>
          <span>Importar GPX</span>
        </button>
      )}
    </div>
  )
}
