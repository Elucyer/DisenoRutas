import { useRouteStore } from '../../store/routeStore'
import { snapRouteToRoad } from '../../services/routingService'
import { calculateMetrics } from '../../utils/routeMetrics'
import type { Route } from '../../types/route'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, ACTIVITY_LABELS, formatTime } from '../../utils/routeMetrics'

function formatPace(minutes: number, distanceKm: number): string {
  const paceMinKm = minutes / distanceKm
  const m = Math.floor(paceMinKm)
  const s = Math.round((paceMinKm - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

interface Props {
  route: Route
}

export function MetricsSummary({ route }: Props) {
  const m = route.metrics
  const { snappingRouteId, snappingProgress, setSnappingRoute, saveRoute } = useRouteStore()
  const isSnapping = snappingRouteId === route.id

  async function handleSnapRoute() {
    if (isSnapping) return
    setSnappingRoute(route.id, 0)
    try {
      const snapped = await snapRouteToRoad(
        route.coordinates,
        route.activityType,
        (pct) => setSnappingRoute(route.id, pct)
      )
      const updated: Route = {
        ...route,
        coordinates: snapped,
        metrics: calculateMetrics(snapped, route.activityType),
      }
      saveRoute(updated)
    } catch (e) {
      console.error('Snap route failed', e)
    } finally {
      setSnappingRoute(null)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{route.activityType === 'running' ? '🏃' : route.activityType === 'cycling' ? '🚵' : '🥾'}</span>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{route.name}</p>
          <p className="text-gray-500 text-xs">{ACTIVITY_LABELS[route.activityType]}</p>
          {route.createdAt && (
            <p className="text-gray-600 text-[10px]">
              {new Date(route.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
        {m && (
          <span
            className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: DIFFICULTY_COLORS[m.difficulty] + '30', color: DIFFICULTY_COLORS[m.difficulty] }}
          >
            {DIFFICULTY_LABELS[m.difficulty]}
          </span>
        )}
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon="📏" label="Distancia" value={`${m.distance} km`} />
          <Stat icon="⏱️" label={route.description?.startsWith('strava:') ? 'Tiempo real' : 'Tiempo est.'} value={formatTime(m.estimatedTime)} />
          <Stat icon="⬆️" label="Desnivel +" value={`${m.elevationGain} m`} />
          <Stat icon="⬇️" label="Desnivel -" value={`${m.elevationLoss} m`} />
          <Stat icon="🏔️" label="Máx. altitud" value={`${m.elevationMax} m`} />
          <Stat icon="🔥" label="Kcal" value={`~${m.kcal}`} />
          {m.distance > 0 && m.estimatedTime > 0 && (
            route.activityType === 'cycling'
              ? <Stat icon="⚡" label="Velocidad" value={`${(m.distance / (m.estimatedTime / 60)).toFixed(1)} km/h`} />
              : <Stat icon="⚡" label="Ritmo" value={formatPace(m.estimatedTime, m.distance)} />
          )}
        </div>
      )}

      {/* Snap to road button */}
      <button
        onClick={handleSnapRoute}
        disabled={isSnapping}
        className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border ${
          isSnapping
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 cursor-wait'
            : 'border-white/10 text-gray-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10'
        }`}
      >
        {isSnapping ? (
          <>
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span>Ajustando a vía... {snappingProgress}%</span>
          </>
        ) : (
          <>
            <span>🛣️</span>
            <span>Ajustar ruta a vía</span>
          </>
        )}
      </button>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className="text-gray-500 text-[10px] flex items-center gap-1">
        <span>{icon}</span>{label}
      </p>
      <p className="text-white text-sm font-semibold">{value}</p>
    </div>
  )
}
