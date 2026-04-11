import { useState } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { MetricsSummary } from './MetricsSummary'
import { ElevationProfile } from '../ElevationProfile/ElevationProfile'
import { WeatherPanel } from '../Weather/WeatherPanel'
import { exportGPX } from '../../utils/gpxParser'
import { ACTIVITY_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../utils/routeMetrics'
import type { Route } from '../../types/route'

type Panel = 'list' | 'detail'
type DetailTab = 'metrics' | 'elevation' | 'weather'

export function RouteSidebar() {
  const { routes, activeRouteId, setActiveRoute, deleteRoute } = useRouteStore()
  const [panel, setPanel] = useState<Panel>('list')
  const [detailTab, setDetailTab] = useState<DetailTab>('metrics')

  const activeRoute = routes.find(r => r.id === activeRouteId)

  const handleRouteClick = (route: Route) => {
    setActiveRoute(route.id)
    setPanel('detail')
  }

  const handleExportGPX = (route: Route) => {
    const gpx = exportGPX(route)
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${route.name.replace(/\s+/g, '_')}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 border-r border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        {panel === 'detail' && activeRoute ? (
          <button
            onClick={() => setPanel('list')}
            className="text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-colors"
          >
            ← Rutas
          </button>
        ) : (
          <h1 className="text-white font-bold text-sm flex items-center gap-2">
            🗺️ RutasMap
          </h1>
        )}
        <span className="text-gray-600 text-xs">{routes.length} rutas</span>
      </div>

      {/* Route list */}
      {panel === 'list' && (
        <div className="flex-1 overflow-y-auto">
          {routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
              <span className="text-4xl">🏔️</span>
              <p className="text-gray-400 text-sm font-medium">Sin rutas todavía</p>
              <p className="text-gray-600 text-xs">Dibuja una ruta en el mapa o importa un archivo GPX</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {routes.map(route => (
                <RouteCard
                  key={route.id}
                  route={route}
                  isActive={route.id === activeRouteId}
                  onClick={() => handleRouteClick(route)}
                  onDelete={() => deleteRoute(route.id)}
                  onExport={() => handleExportGPX(route)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Route detail */}
      {panel === 'detail' && activeRoute && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Tabs */}
          <div className="flex border-b border-white/5">
            {(['metrics', 'elevation', 'weather'] as DetailTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  detailTab === tab
                    ? 'text-orange-400 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'metrics' ? '📊 Stats' : tab === 'elevation' ? '📈 Altimetria' : '🌤️ Clima'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {detailTab === 'metrics' && (
              <div className="h-full overflow-y-auto">
                <MetricsSummary route={activeRoute} />
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={() => handleExportGPX(activeRoute)}
                    className="flex-1 py-2 rounded-lg text-xs text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-all"
                  >
                    ⬇️ Exportar GPX
                  </button>
                  <button
                    onClick={() => { deleteRoute(activeRoute.id); setPanel('list') }}
                    className="py-2 px-3 rounded-lg text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}

            {detailTab === 'elevation' && (
              <div className="h-full p-2">
                <ElevationProfile />
              </div>
            )}

            {detailTab === 'weather' && (
              <div className="h-full overflow-y-auto">
                <WeatherPanel />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RouteCard({
  route,
  isActive,
  onClick,
  onDelete,
  onExport,
}: {
  route: Route
  isActive: boolean
  onClick: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const activityIcon = route.activityType === 'running' ? '🏃' : route.activityType === 'cycling' ? '🚵' : '🥾'

  return (
    <div
      className={`px-4 py-3 cursor-pointer transition-colors group ${
        isActive ? 'bg-orange-500/10' : 'hover:bg-white/5'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: route.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{activityIcon}</span>
            <p className="text-white text-sm font-medium truncate">{route.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {route.metrics && (
              <>
                <span className="text-gray-500 text-xs">{route.metrics.distance} km</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-500 text-xs">↑{route.metrics.elevationGain}m</span>
                <span className="text-gray-700">·</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: DIFFICULTY_COLORS[route.metrics.difficulty] + '20',
                    color: DIFFICULTY_COLORS[route.metrics.difficulty],
                  }}
                >
                  {DIFFICULTY_LABELS[route.metrics.difficulty]}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onExport() }}
            className="p-1 text-gray-500 hover:text-gray-300 rounded"
            title="Exportar GPX"
          >
            ⬇️
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 text-gray-500 hover:text-red-400 rounded"
            title="Eliminar"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}
