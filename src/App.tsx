import { useEffect, useState, useRef } from 'react'
import { MapView } from './components/Map/MapView'
import { LayerSwitcher } from './components/Map/LayerSwitcher'
import { DrawingControls } from './components/Map/DrawingControls'
import { GpxDropZone } from './components/Map/GpxDropZone'
import { RouteSidebar } from './components/RouteEditor/RouteSidebar'
import { ElevationBar } from './components/ElevationProfile/ElevationBar'
import { useRouteStore } from './store/routeStore'
import { useElevationFetch } from './hooks/useElevationFetch'
import { useAuthStore } from './store/authStore'
import { useAuthModalStore } from './store/authModalStore'
import { AuthModal } from './components/Auth/AuthModal'

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 520

export default function App() {
  const activeRouteId = useRouteStore(s => s.activeRouteId)
  const loadRoutes = useRouteStore(s => s.loadRoutes)
  const authModalOpen = useAuthModalStore(s => s.open)
  const [elevationHeight, setElevationHeight] = useState(180)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const sidebarDragStart = useRef<{ x: number; w: number } | null>(null)
  useElevationFetch()

  useEffect(() => {
    // Handle auth token from Strava OAuth redirect
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const authError = params.get('auth_error')
    if (token) {
      useAuthStore.getState().login(token)
      window.history.replaceState({}, '', window.location.pathname)
    } else if (authError) {
      console.warn('Auth error:', authError)
      window.history.replaceState({}, '', window.location.pathname)
    }

    loadRoutes().then(() => {
      const p = new URLSearchParams(window.location.search)
      const sharedRoute = p.get('route')
      if (sharedRoute) {
        useRouteStore.getState().setActiveRoute(sharedRoute)
        window.history.replaceState({}, '', window.location.pathname)
      }
    })
  }, [loadRoutes])

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
      {authModalOpen && <AuthModal />}
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
