import { useState, useMemo, useEffect } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { getMapInstance } from '../../services/mapInstance'
import { MetricsSummary } from './MetricsSummary'
import { ElevationProfile } from '../ElevationProfile/ElevationProfile'
import { WeatherPanel } from '../Weather/WeatherPanel'
import { StravaImportPanel } from '../Strava/StravaImportPanel'
import { exportGPX } from '../../utils/gpxParser'
import { ACTIVITY_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../utils/routeMetrics'
import type { Route, ActivityType, DifficultyLevel } from '../../types/route'

type Panel = 'list' | 'detail' | 'strava'
type DetailTab = 'metrics' | 'elevation' | 'weather'

const DISTANCE_RANGES = [
  { label: 'Todos', min: 0, max: Infinity },
  { label: '< 5 km', min: 0, max: 5 },
  { label: '5–15 km', min: 5, max: 15 },
  { label: '15–30 km', min: 15, max: 30 },
  { label: '> 30 km', min: 30, max: Infinity },
]

export function RouteSidebar() {
  const { routes, activeRouteId, setActiveRoute, deleteRoute } = useRouteStore()
  const { privacyZone, setPrivacyZone } = useMapStore()
  const [panel, setPanel] = useState<Panel>('list')
  const [detailTab, setDetailTab] = useState<DetailTab>('metrics')
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [filterActivity, setFilterActivity] = useState<ActivityType | 'all'>('all')
  const [filterDifficulties, setFilterDifficulties] = useState<Set<DifficultyLevel>>(new Set())
  const [filterDistIdx, setFilterDistIdx] = useState(0)

  const activeFilters = (filterActivity !== 'all' ? 1 : 0) + (filterDifficulties.size > 0 ? 1 : 0) + (filterDistIdx !== 0 ? 1 : 0)

  const toggleDifficulty = (d: DifficultyLevel) => {
    setFilterDifficulties(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const filteredRoutes = useMemo(() => {
    const { min, max } = DISTANCE_RANGES[filterDistIdx]
    return routes.filter(r => {
      if (filterActivity !== 'all' && r.activityType !== filterActivity) return false
      if (filterDifficulties.size > 0 && (!r.metrics || !filterDifficulties.has(r.metrics.difficulty))) return false
      const dist = r.metrics?.distance ?? 0
      if (dist < min || dist >= max) return false
      return true
    })
  }, [routes, filterActivity, filterDifficulties, filterDistIdx])

  const activeRoute = routes.find(r => r.id === activeRouteId)

  // Cuando activeRouteId cambia desde el mapa, abre el panel de detalle
  useEffect(() => {
    if (activeRouteId) setPanel('detail')
    else setPanel('list')
  }, [activeRouteId])

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
            onClick={() => setActiveRoute(null)}
            className="text-gray-400 hover:text-white text-xs flex items-center gap-1 transition-colors"
          >
            ← Rutas
          </button>
        ) : panel === 'strava' ? (
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
        <div className="flex items-center gap-2">
          {panel === 'list' && (
            <>
              <button
                onClick={() => setShowFilters(v => !v)}
                title="Filtros"
                className={`relative flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                  activeFilters > 0
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                ⚙ Filtros
                {activeFilters > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] flex items-center justify-center font-bold">
                    {activeFilters}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPanel('strava')}
                title="Importar desde Strava"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all"
              >
                🟠 Strava
              </button>
            </>
          )}
          <span className="text-gray-600 text-xs">
            {activeFilters > 0 ? `${filteredRoutes.length}/${routes.length}` : `${routes.length}`}
          </span>
        </div>
      </div>

      {/* Route list */}
      {panel === 'list' && (
        <>
          {/* Filter panel */}
          {showFilters && (
            <div className="border-b border-white/5 px-3 py-2.5 space-y-2.5 bg-gray-900/50">
              {/* Activity type */}
              <div>
                <p className="text-gray-600 text-[9px] uppercase tracking-wider mb-1.5">Actividad</p>
                <div className="flex gap-1 flex-wrap">
                  {(['all', 'running', 'cycling', 'hiking'] as const).map(a => (
                    <button key={a} onClick={() => setFilterActivity(a)}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        filterActivity === a
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                          : 'border-white/10 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {a === 'all' ? 'Todos' : a === 'running' ? '🏃 Carrera' : a === 'cycling' ? '🚵 Ciclismo' : '🥾 Senderismo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <p className="text-gray-600 text-[9px] uppercase tracking-wider mb-1.5">Dificultad</p>
                <div className="flex gap-1 flex-wrap">
                  {(['easy', 'moderate', 'challenging', 'strenuous', 'expert'] as const).map(d => (
                    <button key={d} onClick={() => toggleDifficulty(d)}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        filterDifficulties.has(d)
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                          : 'border-white/10 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distance */}
              <div>
                <p className="text-gray-600 text-[9px] uppercase tracking-wider mb-1.5">Distancia</p>
                <div className="flex gap-1 flex-wrap">
                  {DISTANCE_RANGES.map((r, i) => (
                    <button key={i} onClick={() => setFilterDistIdx(i)}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        filterDistIdx === i
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                          : 'border-white/10 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterActivity('all'); setFilterDifficulties(new Set()); setFilterDistIdx(0) }}
                  className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                <span className="text-4xl">🏔️</span>
                <p className="text-gray-400 text-sm font-medium">Sin rutas todavía</p>
                <p className="text-gray-600 text-xs">Dibuja una ruta en el mapa o importa un archivo GPX</p>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
                <span className="text-3xl">🔍</span>
                <p className="text-gray-400 text-sm">Sin resultados</p>
                <button
                  onClick={() => { setFilterActivity('all'); setFilterDifficulties(new Set()); setFilterDistIdx(0) }}
                  className="text-xs text-orange-400 hover:text-orange-300"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredRoutes.map(route => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    isActive={route.id === activeRouteId}
                    onClick={() => handleRouteClick(route)}
                    onDelete={() => setConfirmDeleteId(route.id)}
                    onExport={() => handleExportGPX(route)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Privacy zone — hidden UI, applied automatically in MapView */}
        </>
      )}

      {/* Strava import */}
      {panel === 'strava' && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <StravaImportPanel onClose={() => setPanel('list')} />
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
                    onClick={() => setConfirmDeleteId(activeRoute.id)}
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
      {/* Delete confirmation modal */}
      {confirmDeleteId && (() => {
        const route = routes.find(r => r.id === confirmDeleteId)
        if (!route) return null
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl mx-4 p-5 w-full max-w-[240px]">
              <p className="text-white font-semibold text-sm mb-1">¿Eliminar ruta?</p>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">
                "<span className="text-gray-300">{route.name}</span>" se eliminará permanentemente.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteRoute(confirmDeleteId)
                    if (activeRouteId === confirmDeleteId) setPanel('list')
                    setConfirmDeleteId(null)
                  }}
                  className="flex-1 py-2 rounded-lg text-xs bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )
      })()}
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
