import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { buildElevationProfile } from '../../utils/routeMetrics'
import { gradientColor } from '../../utils/routeMetrics'
import type { ElevationPoint } from '../../types/route'

interface TooltipProps {
  active?: boolean
  payload?: { payload: ElevationPoint }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-semibold">{d.elevation}m</p>
      <p className="text-gray-400">{d.distance.toFixed(2)} km</p>
      <p style={{ color: gradientColor(d.gradient) }}>Pendiente: {d.gradient > 0 ? '+' : ''}{d.gradient}%</p>
    </div>
  )
}

export function ElevationProfile() {
  const { routes, activeRouteId } = useRouteStore()
  const { hoverDistanceKm, setHoverDistance } = useMapStore()

  const activeRoute = routes.find(r => r.id === activeRouteId)

  const profile = useMemo(() => {
    if (!activeRoute) return []
    return buildElevationProfile(activeRoute.coordinates)
  }, [activeRoute])

  if (!activeRoute || profile.length < 2) return null

  const hasElevation = activeRoute.coordinates.some(c => c.elevation != null && c.elevation > 0)

  if (!hasElevation) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500 text-xs">Sin datos de elevacion. Importa un GPX con altimetria o espera la carga de la API.</p>
      </div>
    )
  }

  const minElev = Math.min(...profile.map(p => p.elevation))
  const maxElev = Math.max(...profile.map(p => p.elevation))
  const domain: [number, number] = [Math.max(0, minElev - 50), maxElev + 50]

  return (
    <div className="w-full h-full px-2" onMouseLeave={() => setHoverDistance(null)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={profile}
          onMouseMove={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload = (e as any).activePayload
            if (payload?.[0]) {
              setHoverDistance((payload[0].payload as ElevationPoint).distance)
            }
          }}
        >
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="distance"
            tickFormatter={v => `${v.toFixed(1)}km`}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tickFormatter={v => `${v}m`}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          {hoverDistanceKm != null && (
            <ReferenceLine x={hoverDistanceKm} stroke="#f97316" strokeWidth={2} strokeDasharray="3 3" />
          )}
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#elevGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
