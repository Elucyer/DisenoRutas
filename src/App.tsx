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
import { useIsMobile } from './hooks/useIsMobile'

const MIN_SIDEBAR = 220
const MAX_SIDEBAR = 520

export default function App() {
  const activeRouteId = useRouteStore(s => s.activeRouteId)
  const loadRoutes = useRouteStore(s => s.loadRoutes)
  const authModalOpen = useAuthModalStore(s => s.open)
  const [elevationHeight, setElevationHeight] = useState(180)
  const [sidebarWidth, setSidebarWidth] = useState(288)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const sidebarDragStart = useRef<{ x: number; w: number } | null>(null)
  const isMobile = useIsMobile()
  useElevationFetch()

  useEffect(() => {
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

  // Cerrar sidebar móvil al seleccionar ruta
  useEffect(() => {
    if (isMobile && activeRouteId) setMobileSidebarOpen(true)
  }, [activeRouteId, isMobile])

  if (isMobile) {
    return (
      <div className="relative h-screen w-screen overflow-hidden">
        {authModalOpen && <AuthModal />}

        {/* Mapa ocupa toda la pantalla */}
        <div className="absolute inset-0">
          <MapView />
          <LayerSwitcher />
          <DrawingControls />
          <GpxDropZone />
        </div>

        {/* Perfil de elevación en móvil */}
        {activeRouteId && !mobileSidebarOpen && (
          <div className="absolute bottom-0 left-0 right-0 z-10">
            <ElevationBar height={120} onHeightChange={() => {}} />
          </div>
        )}

        {/* Botón flotante para abrir sidebar */}
        {!mobileSidebarOpen && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="absolute top-4 left-4 z-20 w-10 h-10 rounded-xl bg-gray-900/95 border border-white/10 shadow-lg flex items-center justify-center text-white backdrop-blur"
            aria-label="Abrir menú"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>
        )}

        {/* Backdrop */}
        {mobileSidebarOpen && (
          <div
            className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar como drawer lateral */}
        <div
          className={`absolute top-0 left-0 h-full z-30 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ width: 'min(85vw, 340px)' }}
        >
          <RouteSidebar onClose={() => setMobileSidebarOpen(false)} />
        </div>
      </div>
    )
  }

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
