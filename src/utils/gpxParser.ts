import type { Coordinate, Route, ActivityType } from '../types/route'
import { nanoid } from '../utils/nanoid'

function readPoint(el: Element): Coordinate {
  const ele = el.querySelector('ele')?.textContent
  const elevation = ele != null ? parseFloat(ele) : NaN
  return {
    lat: parseFloat(el.getAttribute('lat') ?? ''),
    lng: parseFloat(el.getAttribute('lon') ?? ''),
    elevation: Number.isFinite(elevation) ? elevation : undefined,
  }
}

function isValidCoord(c: Coordinate): boolean {
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180
}

export function parseGPX(gpxText: string): Partial<Route> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(gpxText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('El archivo GPX no es XML válido')

  const name = (doc.querySelector('metadata > name') ?? doc.querySelector('trk > name') ?? doc.querySelector('name'))
    ?.textContent?.trim() || 'Ruta importada'

  let coordinates = Array.from(doc.querySelectorAll('trkpt')).map(readPoint).filter(isValidCoord)
  // If no track points, try route points
  if (coordinates.length === 0) {
    coordinates = Array.from(doc.querySelectorAll('rtept')).map(readPoint).filter(isValidCoord)
  }
  if (coordinates.length < 2) throw new Error('El GPX no contiene una ruta con al menos 2 puntos')

  const waypoints = Array.from(doc.querySelectorAll('wpt'))
    .map(wpt => ({ wpt, coordinate: readPoint(wpt) }))
    .filter(({ coordinate }) => isValidCoord(coordinate))
    .map(({ wpt, coordinate }) => ({
      id: nanoid(),
      coordinate,
      name: wpt.querySelector('name')?.textContent ?? undefined,
      type: 'poi' as const,
    }))

  // Detect activity type from GPX type/keywords
  const typeText = (doc.querySelector('trk > type')?.textContent ?? '').toLowerCase()
  const nameLower = name.toLowerCase()
  let activityType: ActivityType = 'hiking'
  if (typeText.includes('run') || typeText.includes('trail') || nameLower.includes('run') || nameLower.includes('carrera') || nameLower.includes('maraton')) {
    activityType = 'running'
  } else if (typeText.includes('ride') || typeText.includes('cycl') || typeText.includes('bike') || nameLower.includes('cicl') || nameLower.includes('bici')) {
    activityType = 'cycling'
  }

  // Try to get the original date from GPX metadata
  const timeText = doc.querySelector('metadata > time')?.textContent ?? doc.querySelector('trkpt > time')?.textContent
  const parsedTime = timeText ? new Date(timeText).getTime() : NaN
  const createdAt = Number.isFinite(parsedTime) ? parsedTime : Date.now()

  return {
    id: nanoid(),
    name,
    activityType,
    coordinates,
    waypoints,
    color: randomRouteColor(),
    tags: [],
    createdAt,
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function exportGPX(route: Route): string {
  const safeName = escapeXml(route.name)
  const safeType = escapeXml(route.activityType)
  const pts = route.coordinates.map(c => {
    const ele = c.elevation != null ? `\n        <ele>${c.elevation}</ele>` : ''
    return `    <trkpt lat="${c.lat}" lon="${c.lng}">${ele}\n    </trkpt>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RutasMap" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${new Date(route.createdAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <type>${safeType}</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`
}

export function randomRouteColor(): string {
  const colors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#eab308']
  return colors[Math.floor(Math.random() * colors.length)]
}
