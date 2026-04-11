import { useEffect, useState } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { getRouteWeather } from '../../services/weatherService'
import type { RouteWeather } from '../../types/weather'

export function WeatherPanel() {
  const { routes, activeRouteId } = useRouteStore()
  const [weather, setWeather] = useState<RouteWeather | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeRoute = routes.find(r => r.id === activeRouteId)

  useEffect(() => {
    if (!activeRoute || activeRoute.coordinates.length === 0) {
      setWeather(null)
      return
    }

    const start = activeRoute.coordinates[0]
    const elevation = start.elevation ?? activeRoute.metrics?.elevationMin ?? 0

    setLoading(true)
    setError(null)

    getRouteWeather(start.lat, start.lng, elevation)
      .then(w => { setWeather(w); setLoading(false) })
      .catch(() => { setError('No se pudo cargar el clima'); setLoading(false) })
  }, [activeRouteId])

  if (!activeRoute) return null

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin text-2xl mb-2">🌀</div>
        <p className="text-gray-500 text-xs">Cargando clima...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-400 text-xs">{error}</p>
      </div>
    )
  }

  if (!weather) return null

  const w = weather.start

  return (
    <div className="p-4 space-y-3">
      {weather.alerts.map((alert, i) => (
        <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
          {alert}
        </div>
      ))}

      <div className="bg-gray-800/60 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-4xl">{w.weatherIcon}</p>
            <p className="text-white font-semibold text-xl mt-1">{w.temperature}°C</p>
            <p className="text-gray-400 text-xs">Sensación {w.feelsLike}°C</p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-gray-400 text-xs">{w.weatherDescription}</p>
            <p className="text-gray-400 text-xs">💨 {w.windSpeed} km/h</p>
            <p className="text-gray-400 text-xs">💧 {w.humidity}%</p>
            {w.precipitation > 0 && <p className="text-blue-400 text-xs">🌧️ {w.precipitation}mm</p>}
          </div>
        </div>
      </div>

      {/* 24h forecast */}
      <div>
        <p className="text-gray-500 text-xs mb-2">Próximas 24h</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {weather.forecast.slice(0, 8).map((h, i) => (
            <div key={i} className="flex-shrink-0 bg-gray-800/60 rounded-lg px-2 py-2 text-center min-w-[52px]">
              <p className="text-gray-500 text-[10px]">{new Date(h.time).getHours()}h</p>
              <p className="text-lg">{getWeatherIcon(h.weatherCode)}</p>
              <p className="text-white text-xs font-medium">{h.temperature}°</p>
              {h.precipitation > 0 && <p className="text-blue-400 text-[10px]">{h.precipitation}mm</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Best windows */}
      {weather.bestWindows.length > 0 && (
        <div>
          <p className="text-gray-500 text-xs mb-2">Mejores ventanas</p>
          <div className="space-y-1">
            {weather.bestWindows.slice(0, 3).map((w, i) => (
              <div key={i} className="bg-gray-800/60 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-gray-300 text-xs">{formatDateTime(w.time)}</p>
                <div className="flex items-center gap-2">
                  <p className="text-gray-500 text-xs">{w.description}</p>
                  <div
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: scoreColor(w.score) + '30', color: scoreColor(w.score) }}
                  >
                    {w.score}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#84cc16'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
