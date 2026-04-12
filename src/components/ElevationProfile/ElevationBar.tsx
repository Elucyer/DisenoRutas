import { useMemo, useRef, useCallback, useEffect } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { buildElevationProfile, gradientColor, formatTime, ACTIVITY_LABELS } from '../../utils/routeMetrics'
import { refreshElevationForRoute } from '../../hooks/useElevationFetch'
import { snapRouteToRoad } from '../../services/routingService'
import { calculateMetrics } from '../../utils/routeMetrics'
import type { ElevationPoint, Route } from '../../types/route'

interface TooltipProps {
  active?: boolean
  payload?: { payload: ElevationPoint }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none">
      <p className="text-white font-semibold">{d.elevation} m</p>
      <p className="text-gray-400">{d.distance.toFixed(2)} km</p>
      <p style={{ color: gradientColor(d.gradient) }}>
        {d.gradient > 0 ? '+' : ''}{d.gradient}%
      </p>
    </div>
  )
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 500

interface ElevationBarProps {
  height: number
  onHeightChange: (h: number) => void
}

export function ElevationBar({ height, onHeightChange }: ElevationBarProps) {
  const { routes, activeRouteId, elevationLoadingId, snappingRouteId, snappingProgress, setSnappingRoute, saveRoute } = useRouteStore()
  const { hoverDistanceKm, setHoverDistance, requestFlyTo, eraserActive, toggleEraser, eraserRadius, setEraserRadius, editingRouteId, setEditingRouteId } = useMapStore()
  const hoveredPoint = useRef<ElevationPoint | null>(null)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef<number>(height)

  const onDragStart = (e: React.MouseEvent) => {
    dragStartY.current = e.clientY
    dragStartH.current = height
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragStartY.current === null) return
      const delta = dragStartY.current - e.clientY
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH.current + delta))
      onHeightChange(next)
    }
    const onUp = () => {
      dragStartY.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onHeightChange])

  const activeRoute = routes.find(r => r.id === activeRouteId)
  const isLoading = elevationLoadingId === activeRouteId
  const isSnapping = snappingRouteId === activeRouteId

  async function handleSnapRoute() {
    if (!activeRoute || isSnapping) return
    setSnappingRoute(activeRoute.id, 0)
    try {
      const snapped = await snapRouteToRoad(
        activeRoute.coordinates,
        activeRoute.activityType,
        (pct) => setSnappingRoute(activeRoute.id, pct)
      )
      saveRoute({ ...activeRoute, coordinates: snapped, metrics: calculateMetrics(snapped, activeRoute.activityType) } as Route)
    } finally {
      setSnappingRoute(null)
    }
  }

  const profile = useMemo(() => {
    if (!activeRoute) return []
    return buildElevationProfile(activeRoute.coordinates)
  }, [activeRoute])

  const getPointFromEvent = (e: unknown): ElevationPoint | null => {
    const evt = e as { activeIndex?: string | number }
    const idx = evt.activeIndex != null ? parseInt(String(evt.activeIndex)) : -1
    return idx >= 0 && idx < profile.length ? profile[idx] : null
  }

  const handleChartMouseMove = useCallback((e: unknown) => {
    const pt = getPointFromEvent(e)
    if (pt) {
      hoveredPoint.current = pt
      setHoverDistance(pt.distance)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHoverDistance, profile])

  const handleChartClick = useCallback((e: unknown) => {
    const pt = getPointFromEvent(e) ?? hoveredPoint.current
    if (!pt) return
    requestFlyTo(pt.lng, pt.lat, 14)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestFlyTo, profile])

  if (!activeRoute) return null

  const hasElevation = profile.some(p => p.elevation > 0)
  const m = activeRoute.metrics

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 bg-gray-950/95 backdrop-blur border-t border-white/10 shadow-2xl flex flex-col"
      style={{ height }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="flex-shrink-0 flex items-center justify-center h-3 cursor-ns-resize group"
      >
        <div className="w-10 h-1 rounded-full bg-white/10 group-hover:bg-orange-500/50 transition-colors" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 px-4 pt-2 pb-1 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-[10px]">
            {activeRoute.activityType === 'running' ? '🏃' : activeRoute.activityType === 'cycling' ? '🚵' : '🥾'}
          </span>
          <span className="text-white text-xs font-semibold truncate max-w-[140px]">{activeRoute.name}</span>
          <span className="text-gray-600 text-[10px]">{ACTIVITY_LABELS[activeRoute.activityType]}</span>
        </div>

        <div className="flex items-center gap-3 ml-auto text-xs">
          {m && (
            <>
              <Stat label="📏" value={`${m.distance} km`} />
              <Stat label="⬆️" value={`${m.elevationGain} m`} />
              <Stat label="⬇️" value={`${m.elevationLoss} m`} />
              <Stat label="🏔️" value={`${m.elevationMax} m`} />
              <Stat label="⏱️" value={formatTime(m.estimatedTime)} />
            </>
          )}
          {/* Edit route button */}
          <button
            onClick={() => setEditingRouteId(editingRouteId === activeRouteId ? null : (activeRouteId ?? null))}
            title="Editar ruta manualmente"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
              editingRouteId === activeRouteId
                ? 'border-green-500/60 bg-green-500/15 text-green-400'
                : 'border-white/10 text-gray-400 hover:text-green-400 hover:border-green-500/40 hover:bg-green-500/10'
            }`}
          >
            <span>✏️</span>
            <span>{editingRouteId === activeRouteId ? 'Editando' : 'Editar'}</span>
          </button>

          {/* Eraser tool */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleEraser}
              title="Borrador de tramos"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                eraserActive
                  ? 'border-red-500/60 bg-red-500/15 text-red-400'
                  : 'border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10'
              }`}
            >
              <span>🧹</span>
              <span>{eraserActive ? 'Borrador ON' : 'Borrador'}</span>
            </button>
            {eraserActive && (
              <div className="flex items-center gap-1">
                <span className="text-gray-600 text-[10px]">radio</span>
                <input
                  type="range"
                  min={50} max={500} step={25}
                  value={eraserRadius}
                  onChange={e => setEraserRadius(Number(e.target.value))}
                  className="w-16 accent-red-500"
                  title={`${eraserRadius}m`}
                />
                <span className="text-gray-400 text-[10px] w-10">{eraserRadius}m</span>
              </div>
            )}
          </div>

          {/* Snap to road button */}
          <button
            onClick={handleSnapRoute}
            disabled={isSnapping || isLoading}
            title="Ajustar ruta a vía"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${
              isSnapping
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                : 'border-white/10 text-gray-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10'
            }`}
          >
            {isSnapping ? (
              <>
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span>{snappingProgress}%</span>
              </>
            ) : (
              <>
                <span>🛣️</span>
                <span>Ajustar a vía</span>
              </>
            )}
          </button>

          {/* Refresh elevation button */}
          <button
            onClick={() => refreshElevationForRoute(activeRoute.id)}
            disabled={isLoading}
            title="Actualizar altimetria"
            className="p-1 rounded-md text-gray-500 hover:text-orange-400 hover:bg-white/5 disabled:opacity-40 transition-all"
          >
            {isLoading
              ? <span className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin inline-block" />
              : <span className="text-sm">🔄</span>
            }
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 px-2 py-1" onMouseLeave={() => setHoverDistance(null)}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-xs">Cargando altimetria...</span>
          </div>
        ) : !hasElevation ? (
          <div className="h-full flex items-center justify-center gap-3">
            <span className="text-gray-600 text-xs">Sin datos de elevacion</span>
            <button
              onClick={() => refreshElevationForRoute(activeRoute.id)}
              className="px-3 py-1 rounded-lg text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-all"
            >
              🔄 Cargar altimetria
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={profile}
              margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              style={{ cursor: 'crosshair' }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={() => setHoverDistance(null)}
              onClick={handleChartClick}
            >
              <defs>
                <linearGradient id="elevGradBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="distance"
                tickFormatter={v => `${(v as number).toFixed(1)}km`}
                tick={{ fill: '#4b5563', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={v => `${v}m`}
                tick={{ fill: '#4b5563', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              {hoverDistanceKm != null && (
                <ReferenceLine x={hoverDistanceKm} stroke="#f97316" strokeWidth={1.5} strokeDasharray="3 3" />
              )}
              <Area
                type="monotone"
                dataKey="elevation"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#elevGradBar)"
                dot={false}
                activeDot={{ r: 3, fill: '#f97316', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1 text-gray-300">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </span>
  )
}
