import type { WeatherCurrent, WeatherHourly, RouteWeather } from '../types/weather'

const WMO_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: 'Despejado', icon: '☀️' },
  1: { description: 'Mayormente despejado', icon: '🌤️' },
  2: { description: 'Parcialmente nublado', icon: '⛅' },
  3: { description: 'Nublado', icon: '☁️' },
  45: { description: 'Niebla', icon: '🌫️' },
  48: { description: 'Niebla con escarcha', icon: '🌫️' },
  51: { description: 'Llovizna ligera', icon: '🌦️' },
  61: { description: 'Lluvia ligera', icon: '🌧️' },
  63: { description: 'Lluvia moderada', icon: '🌧️' },
  65: { description: 'Lluvia intensa', icon: '🌧️' },
  71: { description: 'Nieve ligera', icon: '🌨️' },
  73: { description: 'Nieve moderada', icon: '❄️' },
  75: { description: 'Nieve intensa', icon: '❄️' },
  80: { description: 'Chubascos ligeros', icon: '🌦️' },
  81: { description: 'Chubascos moderados', icon: '🌧️' },
  82: { description: 'Chubascos intensos', icon: '⛈️' },
  95: { description: 'Tormenta', icon: '⛈️' },
  96: { description: 'Tormenta con granizo', icon: '⛈️' },
  99: { description: 'Tormenta severa', icon: '⛈️' },
}

function wmoInfo(code: number) {
  return WMO_CODES[code] ?? { description: 'Desconocido', icon: '❓' }
}

// Temperature correction for altitude: -6.5°C per 1000m
export function correctTempForAltitude(temp: number, routeElevation: number, gridElevation = 0): number {
  return temp - ((routeElevation - gridElevation) / 1000) * 6.5
}

function scoreWeatherWindow(weatherCode: number, windSpeed: number, precip: number, temp: number): number {
  let score = 100
  if (weatherCode >= 80) score -= 40
  else if (weatherCode >= 51) score -= 20
  else if (weatherCode >= 45) score -= 15
  if (windSpeed > 50) score -= 30
  else if (windSpeed > 30) score -= 15
  if (precip > 5) score -= 20
  if (temp < 0 || temp > 35) score -= 20
  return Math.max(0, score)
}

export async function getRouteWeather(
  lat: number,
  lng: number,
  elevation: number
): Promise<RouteWeather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat.toString())
  url.searchParams.set('longitude', lng.toString())
  url.searchParams.set('elevation', elevation.toString())
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,relative_humidity_2m,precipitation,weather_code')
  url.searchParams.set('hourly', 'temperature_2m,precipitation,wind_speed_10m,weather_code')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Weather API error')

  const data = await res.json()
  const cur = data.current

  const wmo = wmoInfo(cur.weather_code)
  const start: WeatherCurrent = {
    temperature: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    windSpeed: Math.round(cur.wind_speed_10m),
    windDirection: cur.wind_direction_10m,
    humidity: cur.relative_humidity_2m,
    precipitation: cur.precipitation,
    weatherCode: cur.weather_code,
    weatherDescription: wmo.description,
    weatherIcon: wmo.icon,
  }

  const forecast: WeatherHourly[] = data.hourly.time.slice(0, 48).map((t: string, i: number) => ({
    time: t,
    temperature: Math.round(data.hourly.temperature_2m[i]),
    precipitation: data.hourly.precipitation[i],
    windSpeed: Math.round(data.hourly.wind_speed_10m[i]),
    weatherCode: data.hourly.weather_code[i],
  }))

  const bestWindows = data.hourly.time
    .map((t: string, i: number) => ({
      time: t,
      score: scoreWeatherWindow(
        data.hourly.weather_code[i],
        data.hourly.wind_speed_10m[i],
        data.hourly.precipitation[i],
        data.hourly.temperature_2m[i]
      ),
      description: wmoInfo(data.hourly.weather_code[i]).description,
    }))
    .filter((_: unknown, i: number) => i % 3 === 0) // every 3h
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, 3)

  const dangerCodes = [65, 73, 75, 82, 95, 96, 99]
  const alerts: string[] = []
  if (dangerCodes.includes(cur.weather_code)) {
    alerts.push(`⚠️ Condiciones peligrosas: ${wmoInfo(cur.weather_code).description}`)
  }
  if (cur.wind_speed_10m > 60) alerts.push('⚠️ Viento muy fuerte (>' + cur.wind_speed_10m + ' km/h)')

  return { start, forecast, bestWindows, alerts }
}
