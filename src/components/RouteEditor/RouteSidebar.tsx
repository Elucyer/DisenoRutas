import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { useNoteStore } from '../../store/noteStore'
import { LoginButton } from '../Auth/LoginButton'
import { useAuthStore } from '../../store/authStore'
import { getMapInstance } from '../../services/mapInstance'
import { MetricsSummary } from './MetricsSummary'
import { ElevationProfile } from '../ElevationProfile/ElevationProfile'
import { WeatherPanel } from '../Weather/WeatherPanel'
import { StravaImportPanel } from '../Strava/StravaImportPanel'
import { exportGPX } from '../../utils/gpxParser'
import { ACTIVITY_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS, formatTime } from '../../utils/routeMetrics'
import type { Route, ActivityType, DifficultyLevel, Coordinate } from '../../types/route'

function elevationSparkPath(coords: Coordinate[], w: number, h: number): string {
  const pts = coords.filter(c => c.elevation != null)
  if (pts.length < 2) return ''
  const step = Math.max(1, Math.floor(pts.length / 60))
  const sampled = pts.filter((_, i) => i % step === 0)
  const elevs = sampled.map(c => c.elevation!)
  const minE = Math.min(...elevs)
  const range = Math.max(...elevs) - minE || 1
  return sampled.map((c, i) => {
    const x = (i / (sampled.length - 1)) * w
    const y = h - ((c.elevation! - minE) / range) * (h - 2) - 1
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

type Panel = 'list' | 'detail' | 'strava'
type DetailTab = 'metrics' | 'elevation' | 'weather' | 'notes'

const DISTANCE_RANGES = [
  { label: 'Todos', min: 0, max: Infinity },
  { label: '< 5 km', min: 0, max: 5 },
  { label: '5–15 km', min: 5, max: 15 },
  { label: '15–30 km', min: 15, max: 30 },
  { label: '> 30 km', min: 30, max: Infinity },
]

export function RouteSidebar() {
  const { routes, activeRouteId, setActiveRoute, deleteRoute } = useRouteStore()
  const { privacyZone, setPrivacyZone, addingNote, toggleAddingNote } = useMapStore()
  const { notes, loadNotes, deleteNote } = useNoteStore()
  const isOwner = useAuthStore(s => s.isOwner)
  const [panel, setPanel] = useState<Panel>('list')
  const [detailTab, setDetailTab] = useState<DetailTab>('metrics')
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [filterActivity, setFilterActivity] = useState<ActivityType | 'all'>('all')
  const [filterDifficulties, setFilterDifficulties] = useState<Set<DifficultyLevel>>(new Set())
  const [filterDistIdx, setFilterDistIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'distance' | 'elevation'>('date')
  const [showStats, setShowStats] = useState(false)

  const activeFilters = (filterActivity !== 'all' ? 1 : 0) + (filterDifficulties.size > 0 ? 1 : 0) + (filterDistIdx !== 0 ? 1 : 0)

  const globalStats = useMemo(() => {
    const totals = routes.reduce((acc, r) => {
      acc.distance += r.metrics?.distance ?? 0
      acc.elevation += r.metrics?.elevationGain ?? 0
      acc.time += r.metrics?.estimatedTime ?? 0
      return acc
    }, { distance: 0, elevation: 0, time: 0 })
    const byType = routes.reduce((acc, r) => {
      acc[r.activityType] = (acc[r.activityType] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    return { ...totals, byType, count: routes.length }
  }, [routes])

  const toggleDifficulty = (d: DifficultyLevel) => {
    setFilterDifficulties(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const filteredRoutes = useMemo(() => {
    const { min, max } = DISTANCE_RANGES[filterDistIdx]
    const term = search.trim().toLowerCase()
    const filtered = routes.filter(r => {
      if (filterActivity !== 'all' && r.activityType !== filterActivity) return false
      if (filterDifficulties.size > 0 && (!r.metrics || !filterDifficulties.has(r.metrics.difficulty))) return false
      const dist = r.metrics?.distance ?? 0
      if (dist < min || dist >= max) return false
      if (term && !r.name.toLowerCase().includes(term)) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      if (sortBy === 'distance') return (b.metrics?.distance ?? 0) - (a.metrics?.distance ?? 0)
      if (sortBy === 'elevation') return (b.metrics?.elevationGain ?? 0) - (a.metrics?.elevationGain ?? 0)
      return b.createdAt - a.createdAt
    })
  }, [routes, filterActivity, filterDifficulties, filterDistIdx, search, sortBy])

  const activeRoute = routes.find(r => r.id === activeRouteId)

  // Cuando activeRouteId cambia desde el mapa, abre el panel de detalle
  useEffect(() => {
    if (activeRouteId) {
      setPanel('detail')
      loadNotes(activeRouteId)
    } else {
      setPanel('list')
    }
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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
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
          <h1 className="text-white font-bold text-sm flex items-center gap-1.5 shrink-0">
            🗺️ RutasMap
          </h1>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          {panel === 'list' && (
            <>
              <button
                onClick={() => setShowStats(v => !v)}
                title="Estadísticas globales"
                className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                  showStats
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                📊
              </button>
              <button
                onClick={() => setShowFilters(v => !v)}
                title="Filtros"
                className={`relative flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                  activeFilters > 0
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                ⚙
                {activeFilters > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] flex items-center justify-center font-bold">
                    {activeFilters}
                  </span>
                )}
              </button>
              <span className="text-gray-600 text-xs">
                {activeFilters > 0 ? `${filteredRoutes.length}/${routes.length}` : `${routes.length}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Route list */}
      {panel === 'list' && (
        <>
          {/* Stats panel */}
          {showStats && routes.length > 0 && (
            <div className="border-b border-white/5 px-3 py-3 bg-gray-900/50 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-800/60 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-orange-400 font-bold text-base">{globalStats.count}</p>
                  <p className="text-gray-500 text-[9px]">Rutas</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-orange-400 font-bold text-base">{globalStats.distance.toFixed(0)}</p>
                  <p className="text-gray-500 text-[9px]">km totales</p>
                </div>
                <div className="bg-gray-800/60 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-orange-400 font-bold text-base">{(globalStats.elevation / 1000).toFixed(1)}k</p>
                  <p className="text-gray-500 text-[9px]">m desnivel</p>
                </div>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2">
                <p className="text-gray-500 text-[9px] mb-1.5">Por actividad</p>
                <div className="flex gap-3">
                  {Object.entries(globalStats.byType).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-1">
                      <span className="text-xs">{type === 'running' ? '🏃' : type === 'cycling' ? '🚵' : '🥾'}</span>
                      <span className="text-gray-400 text-xs font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-1.5 flex justify-between items-center">
                <span className="text-gray-500 text-[9px]">Tiempo total estimado</span>
                <span className="text-gray-300 text-xs font-medium">{formatTime(Math.round(globalStats.time))}</span>
              </div>
            </div>
          )}

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

          {/* Search + sort */}
          <div className="px-3 py-2 border-b border-white/5 flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full bg-gray-900 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-orange-500/50 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                >✕</button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-gray-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-400 outline-none focus:border-orange-500/50 transition-colors cursor-pointer"
            >
              <option value="date">📅 Fecha</option>
              <option value="distance">📏 Distancia</option>
              <option value="elevation">⛰️ Desnivel</option>
            </select>
          </div>

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
                    canDelete={isOwner(route.userId)}
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
            {(['metrics', 'elevation', 'weather', 'notes'] as DetailTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setDetailTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors relative ${
                  detailTab === tab
                    ? 'text-orange-400 border-b-2 border-orange-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab === 'metrics' ? '📊 Stats' : tab === 'elevation' ? '📈 Altimetría' : tab === 'weather' ? '🌤️ Clima' : '📝 Notas'}
                {tab === 'notes' && notes.length > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] flex items-center justify-center font-bold">
                    {notes.length}
                  </span>
                )}
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
                  {isOwner(activeRoute.userId) && (
                    <button
                      onClick={() => setConfirmDeleteId(activeRoute.id)}
                      className="py-2 px-3 rounded-lg text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all"
                    >
                      🗑️
                    </button>
                  )}
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

            {detailTab === 'notes' && (
              <div className="h-full flex flex-col">
                <div className="p-3 border-b border-white/5">
                  <button
                    onClick={toggleAddingNote}
                    className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition-all ${
                      addingNote
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                        : 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>📍</span>
                    {addingNote ? 'Clic en el mapa para colocar nota...' : 'Añadir nota en el mapa'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {notes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                      <span className="text-3xl">📝</span>
                      <p className="text-gray-500 text-xs">Sin notas todavía</p>
                      <p className="text-gray-600 text-[10px]">Pulsa el botón y haz clic en cualquier punto del mapa</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {notes.map(note => (
                        <div key={note.id} className="px-3 py-3 hover:bg-white/5 transition-colors">
                          {note.photo && (
                            <img src={note.photo} alt="" className="w-full h-24 object-cover rounded-lg mb-2" />
                          )}
                          {note.comment && (
                            <p className="text-gray-300 text-xs leading-relaxed mb-1">{note.comment}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <p className="text-gray-600 text-[9px]">
                              {new Date(note.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <button
                              onClick={() => deleteNote(note.id)}
                              className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                            >🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

      {/* Footer */}
      <div className="border-t border-white/5 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <button
          onClick={() => setPanel('strava')}
          title="Importar desde Strava"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.024 4.116zm-7.698-4.348l2.104 4.326L12 24l-1.195-2.4-3.116-3.948z"/></svg>
          Strava
        </button>
        <LoginButton />
      </div>
    </div>
  )
}

function RouteCard({
  route,
  isActive,
  canDelete,
  onClick,
  onDelete,
  onExport,
}: {
  route: Route
  isActive: boolean
  canDelete: boolean
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
        {/* Elevation sparkline */}
        {(() => {
          const path = elevationSparkPath(route.coordinates, 80, 20)
          return path ? (
            <svg width="80" height="20" className="flex-shrink-0 opacity-40 group-hover:opacity-70 transition-opacity">
              <path d={path} fill="none" stroke={route.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null
        })()}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onExport() }}
            className="p-1 text-gray-500 hover:text-gray-300 rounded"
            title="Exportar GPX"
          >
            ⬇️
          </button>
          {canDelete && <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1 text-gray-500 hover:text-red-400 rounded"
            title="Eliminar"
          >
            🗑️
          </button>}
        </div>
      </div>
    </div>
  )
}
