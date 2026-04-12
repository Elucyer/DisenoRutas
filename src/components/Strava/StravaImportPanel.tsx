import { useState, useEffect } from 'react'
import { fetchStravaActivities, checkStravaConnected, stravaActivityToRoute, deduplicateActivities, type StravaActivity } from '../../services/stravaService'
import { useRouteStore } from '../../store/routeStore'
import { calculateMetrics } from '../../utils/routeMetrics'
import { randomRouteColor } from '../../utils/gpxParser'
import { nanoid } from '../../utils/nanoid'
import type { Route } from '../../types/route'

interface Props {
  onClose: () => void
}

function formatDistance(meters: number) {
  return (meters / 1000).toFixed(1) + ' km'
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

const SPORT_ICON: Record<string, string> = {
  running: '🏃',
  cycling: '🚵',
  hiking: '🥾',
}

export function StravaImportPanel({ onClose }: Props) {
  const { routes, saveRoute, setActiveRoute } = useRouteStore()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [activities, setActivities] = useState<StravaActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState<Set<number>>(new Set())
  const [imported, setImported] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'running' | 'cycling' | 'hiking'>('all')
  const [uniqueOnly, setUniqueOnly] = useState(true)

  // Pre-mark activities already imported (by strava id stored in description)
  const alreadyImported = new Set(
    routes
      .map(r => r.description?.match(/strava:(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number)
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const ok = await checkStravaConnected()
        setConnected(ok)
        if (!ok) { setLoading(false); return }
        const data = await fetchStravaActivities()
        setActivities(data)
      } catch (e) {
        setError('No se pudo conectar al servidor de Strava (localhost:3001)')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleImport(activity: StravaActivity) {
    if (importing.has(activity.id)) return
    setImporting(prev => new Set(prev).add(activity.id))

    try {
      const parsed = stravaActivityToRoute(activity)
      const metrics = calculateMetrics(parsed.coordinates, parsed.activityType)

      // Use actual Strava moving time (seconds → minutes) instead of estimate
      const movingSecs = Number(activity.moving_time)
      if (metrics && movingSecs > 0) {
        metrics.estimatedTime = Math.round(movingSecs / 60)
      }

      const route: Route = {
        id: nanoid(),
        name: parsed.name,
        activityType: parsed.activityType,
        coordinates: parsed.coordinates,
        waypoints: [],
        metrics,
        createdAt: new Date(parsed.date).getTime(),
        color: randomRouteColor(),
        description: `strava:${activity.id}`,
        tags: ['strava'],
      }

      saveRoute(route)
      setActiveRoute(route.id)
      setImported(prev => new Set(prev).add(activity.id))
    } finally {
      setImporting(prev => { const s = new Set(prev); s.delete(activity.id); return s })
    }
  }

  async function handleImportAll() {
    const toImport = filtered.filter(a => !alreadyImported.has(a.id) && !imported.has(a.id))
    for (const a of toImport) {
      await handleImport(a)
    }
  }

  const deduplicated = uniqueOnly ? deduplicateActivities(activities) : activities

  const filtered = deduplicated.filter(a => {
    if (filter === 'all') return true
    const { activityType } = stravaActivityToRoute(a)
    return activityType === filter
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-orange-400 text-base">🟠</span>
          <h2 className="text-white font-semibold text-sm">Importar desde Strava</h2>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-xs">Conectando...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3 text-center">
          <span className="text-3xl">⚠️</span>
          <p className="text-gray-400 text-sm">{error}</p>
          <p className="text-gray-600 text-xs">Asegúrate de que el servidor de AnalisisStrava esté corriendo en el puerto 3001</p>
        </div>
      ) : !connected ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3 text-center">
          <span className="text-3xl">🔌</span>
          <p className="text-gray-400 text-sm">No hay sesión activa de Strava</p>
          <p className="text-gray-600 text-xs">Conéctate desde el panel de AnalisisStrava primero</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex gap-1 px-3 py-2 border-b border-white/5">
            {(['all', 'running', 'cycling', 'hiking'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  filter === f
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                {f === 'all' ? 'Todas' : f === 'running' ? '🏃 Carrera' : f === 'cycling' ? '🚵 Ciclismo' : '🥾 Senderismo'}
              </button>
            ))}
          </div>

          {/* Count + dedup toggle + import all */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-500 text-xs flex-shrink-0">{filtered.length} rutas</span>
              {uniqueOnly && (
                <span className="text-gray-600 text-[10px]">de {activities.length} actividades</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setUniqueOnly(v => !v)}
                title={uniqueOnly ? 'Mostrando rutas únicas' : 'Mostrando todas las actividades'}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${
                  uniqueOnly
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                    : 'border-white/10 text-gray-500 hover:text-gray-300'
                }`}
              >
                {uniqueOnly ? '✦ Únicas' : '≡ Todas'}
              </button>
              <button
                onClick={handleImportAll}
                className="text-xs text-orange-400 hover:text-orange-300 border border-orange-500/30 px-2 py-1 rounded transition-colors"
              >
                Importar
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {filtered.map(activity => {
              const parsed = stravaActivityToRoute(activity)
              const isImporting = importing.has(activity.id)
              const isDone = alreadyImported.has(activity.id) || imported.has(activity.id)

              return (
                <div key={activity.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3">
                  <span className="text-lg flex-shrink-0">{SPORT_ICON[parsed.activityType]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{activity.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-gray-500 text-[10px]">{formatDate(activity.start_date_local)}</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-gray-500 text-[10px]">{formatDistance(activity.distance)}</span>
                      {activity.moving_time > 0 && (
                        <>
                          <span className="text-gray-700">·</span>
                          <span className="text-gray-500 text-[10px]">{formatTime(activity.moving_time)}</span>
                        </>
                      )}
                      {activity.total_elevation_gain > 0 && (
                        <>
                          <span className="text-gray-700">·</span>
                          <span className="text-gray-500 text-[10px]">↑{Math.round(activity.total_elevation_gain)}m</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => !isDone && handleImport(activity)}
                    disabled={isImporting || isDone}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                      isDone
                        ? 'border-green-500/30 bg-green-500/10 text-green-400 cursor-default'
                        : isImporting
                        ? 'border-orange-500/30 bg-orange-500/10 text-orange-400 cursor-wait'
                        : 'border-white/10 text-gray-400 hover:border-orange-500/40 hover:text-orange-400 hover:bg-orange-500/10'
                    }`}
                  >
                    {isDone ? '✓ Importada' : isImporting ? '...' : 'Importar'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
