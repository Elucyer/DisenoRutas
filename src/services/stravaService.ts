import type { ActivityType, Coordinate } from '../types/route'
import { authHeader } from '../store/authStore'

// In dev, Vite proxies /strava-api → localhost:3002. In prod (Vercel), API lives at /api directly.
const BASE = import.meta.env.DEV ? '/strava-api' : ''

export interface StravaActivity {
  id: number
  name: string
  sport_type: string
  type: string
  start_date_local: string
  distance: number          // meters
  moving_time: number       // seconds
  total_elevation_gain: number
  elev_high: number | null
  elev_low: number | null
  summary_polyline: string
}

/** Google encoded polyline decoder */
function decodePolyline(encoded: string): Coordinate[] {
  const coords: Coordinate[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng

    coords.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return coords
}

function mapActivityType(sportType: string): ActivityType {
  const s = sportType.toLowerCase()
  if (s.includes('run') || s.includes('trail')) return 'running'
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return 'cycling'
  return 'hiking'
}

export async function fetchStravaActivities(): Promise<StravaActivity[]> {
  const res = await fetch(`${BASE}/api/strava/routes`)
  if (!res.ok) throw new Error('No se pudo conectar al backend de Strava')
  return res.json()
}

/** Fetch the authenticated user's own Strava activities via the API */
export async function fetchUserStravaActivities(): Promise<StravaActivity[]> {
  const res = await fetch(`${BASE}/api/strava/user-activities`, {
    headers: authHeader(),
  })
  if (!res.ok) throw new Error('No se pudo cargar tus actividades de Strava')
  return res.json()
}

export async function checkStravaConnected(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/strava/status`)
    if (!res.ok) return false
    const data = await res.json()
    return data.connected === true
  } catch {
    return false
  }
}

/** Decode only the first coordinate of a polyline (fast, for dedup) */
function decodeFirstPoint(encoded: string): { lat: number; lng: number } | null {
  if (!encoded) return null
  let index = 0, lat = 0, lng = 0
  for (let axis = 0; axis < 2; axis++) {
    let shift = 0, result = 0, byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const delta = result & 1 ? ~(result >> 1) : result >> 1
    if (axis === 0) lat += delta; else lng += delta
  }
  return { lat: lat / 1e5, lng: lng / 1e5 }
}

/**
 * Deduplicate activities by:
 *   - activity type
 *   - start point rounded to 2 decimal places (~1.1 km grid)
 *   - distance bucket (rounded to nearest 1 km)
 * Returns one activity per unique combination (most recent wins).
 */
export function deduplicateActivities(activities: StravaActivity[]): StravaActivity[] {
  const seen = new Map<string, StravaActivity>()

  for (const a of activities) {
    const start = decodeFirstPoint(a.summary_polyline)
    if (!start) continue

    const type = mapActivityType(a.sport_type || a.type)
    const latBucket = Math.round(start.lat * 100) / 100   // ~1.1 km
    const lngBucket = Math.round(start.lng * 100) / 100
    const distBucket = Math.round(a.distance / 1000)      // nearest km

    const key = `${type}|${latBucket}|${lngBucket}|${distBucket}`

    // activities arrive sorted by date DESC — first one per key is the most recent
    if (!seen.has(key)) seen.set(key, a)
  }

  return Array.from(seen.values())
}

export function stravaActivityToRoute(activity: StravaActivity) {
  const coordinates = decodePolyline(activity.summary_polyline)
  const activityType = mapActivityType(activity.sport_type || activity.type)

  return {
    stravaId: activity.id,
    name: activity.name,
    activityType,
    coordinates,
    distanceM: activity.distance,
    movingTime: activity.moving_time,
    elevationGain: activity.total_elevation_gain,
    date: activity.start_date_local,
  }
}
