import type { Coordinate } from '../types/route'

const R = 6371 // Earth radius km

export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function totalDistance(coords: Coordinate[]): number {
  let dist = 0
  for (let i = 1; i < coords.length; i++) {
    dist += haversineDistance(coords[i - 1], coords[i])
  }
  return dist
}

/**
 * Ramer-Douglas-Peucker simplification
 */
export function simplifyCoords(coords: Coordinate[], epsilon = 0.00005): Coordinate[] {
  if (coords.length <= 2) return coords

  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < coords.length - 1; i++) {
    const d = perpendicularDistance(coords[i], coords[0], coords[coords.length - 1])
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyCoords(coords.slice(0, maxIdx + 1), epsilon)
    const right = simplifyCoords(coords.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [coords[0], coords[coords.length - 1]]
}

function perpendicularDistance(point: Coordinate, lineStart: Coordinate, lineEnd: Coordinate): number {
  const dx = lineEnd.lng - lineStart.lng
  const dy = lineEnd.lat - lineStart.lat
  const mag = Math.sqrt(dx * dx + dy * dy)
  if (mag === 0) return haversineDistance(point, lineStart)
  return Math.abs(dy * point.lng - dx * point.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng) / mag
}

export function getBearing(a: Coordinate, b: Coordinate): number {
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function getBounds(coords: Coordinate[]): [[number, number], [number, number]] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const c of coords) {
    if (c.lng < minLng) minLng = c.lng
    if (c.lat < minLat) minLat = c.lat
    if (c.lng > maxLng) maxLng = c.lng
    if (c.lat > maxLat) maxLat = c.lat
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}
