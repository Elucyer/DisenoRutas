import { useEffect, useState, useRef } from 'react'
import { MapView } from './components/Map/MapView'
import { LayerSwitcher } from './components/Map/LayerSwitcher'
import { DrawingControls } from './components/Map/DrawingControls'
import { GpxDropZone } from './components/Map/GpxDropZone'
import { RouteSidebar } from './components/RouteEditor/RouteSidebar'
import { ElevationBar } from './components/ElevationProfile/ElevationBar'
import { useRouteStore } from './store/routeStore'
import { useElevationFetch } from './hooks/useElevationFetch'

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 520

export default function App() {
  const activeRouteId = useRouteStore(s => s.activeRouteId)
  const loadRoutes = useRouteStore(s => s.loadRoutes)
  const [elevationHeight, setElevationHeight] = useState(180)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const sidebarDragStart = useRef<{ x: number; w: number } | null>(null)
  useElevationFetch()

  useEffect(() => { loadRoutes() }, [loadRoutes])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!sidebarDragStart.current) return
      const delta = e.clientX - sidebarDragStart.current.x
      setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, sidebarDragStart.current.w + delta)))
    }
    const onUp = () => {
      sidebarDragStart.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="relative flex-shrink-0 flex flex-col z-20 shadow-2xl" style={{ width: sidebarWidth }}>
        <RouteSidebar />
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize group z-30"
          onMouseDown={e => {
            sidebarDragStart.current = { x: e.clientX, w: sidebarWidth }
            document.body.style.cursor = 'ew-resize'
            document.body.style.userSelect = 'none'
          }}
        >
          <div className="w-full h-full bg-transparent group-hover:bg-orange-500/30 transition-colors" />
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        <div
          className="flex-1 relative overflow-hidden"
          style={{ marginBottom: activeRouteId ? elevationHeight : 0 }}
        >
          <MapView />
          <LayerSwitcher />
          <DrawingControls />
          <GpxDropZone />
        </div>

        {activeRouteId && (
          <ElevationBar height={elevationHeight} onHeightChange={setElevationHeight} />
        )}
      </div>
    </div>
  )
}
