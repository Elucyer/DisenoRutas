import type { Coordinate, Route, ActivityType } from '../types/route'
import { nanoid } from '../utils/nanoid'

export function parseGPX(gpxText: string): Partial<Route> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(gpxText, 'application/xml')

  const name = doc.querySelector('name')?.textContent ?? 'Ruta importada'
  const trkpts = doc.querySelectorAll('trkpt')
  const wptNodes = doc.querySelectorAll('wpt')

  const coordinates: Coordinate[] = []

  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat') ?? '0')
    const lng = parseFloat(pt.getAttribute('lon') ?? '0')
    const ele = pt.querySelector('ele')
    const elevation = ele ? parseFloat(ele.textContent ?? '0') : undefined
    coordinates.push({ lat, lng, elevation })
  })

  // If no track points, try route points
  if (coordinates.length === 0) {
    doc.querySelectorAll('rtept').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat') ?? '0')
      const lng = parseFloat(pt.getAttribute('lon') ?? '0')
      const ele = pt.querySelector('ele')
      coordinates.push({ lat, lng, elevation: ele ? parseFloat(ele.textContent ?? '0') : undefined })
    })
  }

  const waypoints = Array.from(wptNodes).map(wpt => ({
    id: nanoid(),
    coordinate: {
      lat: parseFloat(wpt.getAttribute('lat') ?? '0'),
      lng: parseFloat(wpt.getAttribute('lon') ?? '0'),
      elevation: wpt.querySelector('ele') ? parseFloat(wpt.querySelector('ele')!.textContent ?? '0') : undefined,
    },
    name: wpt.querySelector('name')?.textContent ?? undefined,
    type: 'poi' as const,
  }))

  return {
    id: nanoid(),
    name,
    activityType: 'hiking' as ActivityType,
    coordinates,
    waypoints,
    color: randomRouteColor(),
    tags: [],
    createdAt: Date.now(),
  }
}

export function exportGPX(route: Route): string {
  const pts = route.coordinates.map(c => {
    const ele = c.elevation != null ? `\n        <ele>${c.elevation}</ele>` : ''
    return `    <trkpt lat="${c.lat}" lon="${c.lng}">${ele}\n    </trkpt>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RutasMap" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.name}</name>
    <time>${new Date(route.createdAt).toISOString()}</time>
  </metadata>
  <trk>
    <name>${route.name}</name>
    <type>${route.activityType}</type>
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
