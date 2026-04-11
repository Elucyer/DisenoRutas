import { MapView } from './components/Map/MapView'
import { LayerSwitcher } from './components/Map/LayerSwitcher'
import { DrawingControls } from './components/Map/DrawingControls'
import { GpxDropZone } from './components/Map/GpxDropZone'
import { RouteSidebar } from './components/RouteEditor/RouteSidebar'
import { ElevationBar } from './components/ElevationProfile/ElevationBar'
import { useRouteStore } from './store/routeStore'
import { useElevationFetch } from './hooks/useElevationFetch'

export default function App() {
  const activeRouteId = useRouteStore(s => s.activeRouteId)
  useElevationFetch()

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 flex flex-col z-20 shadow-2xl">
        <RouteSidebar />
      </div>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        <div className={`flex-1 relative overflow-hidden ${activeRouteId ? 'mb-[136px]' : ''}`}>
          <MapView />
          <LayerSwitcher />
          <DrawingControls />
          <GpxDropZone />
        </div>

        {/* Elevation bar - always visible at bottom when route active */}
        {activeRouteId && <ElevationBar />}
      </div>
    </div>
  )
}
