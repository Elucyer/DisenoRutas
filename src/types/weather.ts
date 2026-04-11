export interface WeatherCurrent {
  temperature: number
  feelsLike: number
  windSpeed: number
  windDirection: number
  humidity: number
  precipitation: number
  weatherCode: number
  weatherDescription: string
  weatherIcon: string
}

export interface WeatherHourly {
  time: string
  temperature: number
  precipitation: number
  windSpeed: number
  weatherCode: number
}

export interface RouteWeather {
  start: WeatherCurrent
  summit?: WeatherCurrent
  forecast: WeatherHourly[]
  bestWindows: { time: string; score: number; description: string }[]
  alerts: string[]
}
