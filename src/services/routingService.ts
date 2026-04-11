import type { Coordinate, ActivityType } from '../types/route'
import { simplifyCoords } from '../utils/geometry'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'

const OSRM_PROFILE: Record<ActivityType, string> = {
  running: 'foot',
  hiking: 'foot',
  cycling: 'bike',
}

// Snap two points (used during live drawing)
export async function snapToRoad(
  from: Coordinate,
  to: Coordinate,
  activityType: ActivityType
): Promise<Coordinate[]> {
  const profile = OSRM_PROFILE[activityType]
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`

  const res = await fetch(url)
  if (!res.ok) return [from, to]

  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.[0]) return [from, to]

  const geojsonCoords: [number, number][] = data.routes[0].geometry.coordinates
  return geojsonCoords.map(([lng, lat]) => ({ lng, lat }))
}

// Snap a full saved route by sending it through OSRM in chunks of 25 waypoints
export async function snapRouteToRoad(
  coordinates: Coordinate[],
  activityType: ActivityType,
  onProgress?: (pct: number) => void
): Promise<Coordinate[]> {
  if (coordinates.length < 2) return coordinates

  const profile = OSRM_PROFILE[activityType]

  // Simplify to max 100 key waypoints so OSRM doesn't choke
  const waypoints = simplifyCoords(coordinates, 0.0003).slice(0, 100)
  if (waypoints.length < 2) return coordinates

  const CHUNK = 10 // waypoints per request (keeps URLs short)
  const result: Coordinate[] = []
  const chunks: Coordinate[][] = []

  for (let i = 0; i < waypoints.length - 1; i += CHUNK - 1) {
    chunks.push(waypoints.slice(i, i + CHUNK))
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci]
    if (chunk.length < 2) continue

    const coordStr = chunk.map(c => `${c.lng},${c.lat}`).join(';')
    const url = `${OSRM_BASE}/${profile}/${coordStr}?overview=full&geometries=geojson`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('OSRM error')
      const data = await res.json()
      if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route')

      const snapped: Coordinate[] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => ({ lng, lat })
      )
      // Avoid duplicating junction points between chunks
      if (result.length > 0) snapped.shift()
      result.push(...snapped)
    } catch {
      // Fallback: use original waypoints for this chunk
      const fallback = chunk.slice(ci === 0 ? 0 : 1)
      result.push(...fallback)
    }

    onProgress?.(Math.round(((ci + 1) / chunks.length) * 100))
  }

  return result.length >= 2 ? result : coordinates
}
