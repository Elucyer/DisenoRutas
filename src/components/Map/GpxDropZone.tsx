import { useCallback, useRef } from 'react'
import { parseGPX } from '../../utils/gpxParser'
import { calculateMetrics } from '../../utils/routeMetrics'
import { useRouteStore } from '../../store/routeStore'
import type { Route } from '../../types/route'

export function GpxDropZone() {
  const { saveRoute } = useRouteStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    const nameOk = file.name.toLowerCase().endsWith('.gpx')
    const typeOk = !file.type || file.type === 'application/gpx+xml' || file.type === 'application/xml' || file.type === 'text/xml'
    if (!nameOk || !typeOk) return
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const partial = parseGPX(text)
      if (!partial.coordinates || partial.coordinates.length < 2) return

      const route: Route = {
        id: partial.id!,
        name: partial.name!,
        activityType: partial.activityType!,
        coordinates: partial.coordinates,
        waypoints: partial.waypoints ?? [],
        color: partial.color!,
        tags: [],
        createdAt: Date.now(),
        metrics: calculateMetrics(partial.coordinates, partial.activityType!),
      }
      saveRoute(route)
    }
    reader.readAsText(file)
  }, [saveRoute])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).forEach(processFile)
  }, [processFile])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        multiple
        className="hidden"
        onChange={e => Array.from(e.target.files ?? []).forEach(processFile)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="bg-gray-900/90 backdrop-blur border border-white/10 hover:border-orange-500/50 rounded-xl px-4 py-2 text-gray-400 hover:text-orange-400 text-xs font-medium transition-all flex items-center gap-2 shadow-lg"
      >
        <span>📂</span>
        <span>Importar GPX</span>
      </button>
    </div>
  )
}
