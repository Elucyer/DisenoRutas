import { describe, it, expect } from 'vitest'
import { calculateMetrics, buildElevationProfile, formatTime } from '../routeMetrics'
import { haversineDistance, totalDistance, getBounds } from '../geometry'
import { exportGPX } from '../gpxParser'
import { nanoid } from '../nanoid'
import type { Coordinate, Route } from '../../types/route'

const line = (n: number, elev: (i: number) => number | undefined): Coordinate[] =>
  Array.from({ length: n }, (_, i) => ({ lat: 6.2 + i * 0.001, lng: -75.5, elevation: elev(i) }))

describe('geometry', () => {
  it('haversine ~111 km per degree of latitude', () => {
    expect(haversineDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1)
  })

  it('totalDistance sums segments', () => {
    expect(totalDistance(line(11, () => 0))).toBeCloseTo(1.112, 2)
  })

  it('getBounds returns [sw, ne]', () => {
    expect(getBounds([{ lat: 1, lng: 2 }, { lat: -1, lng: 5 }])).toEqual([[2, -1], [5, 1]])
  })
})

describe('calculateMetrics', () => {
  it('computes gain/loss on a clean climb and descent', () => {
    const coords = line(21, i => (i <= 10 ? 1000 + i * 10 : 1100 - (i - 10) * 10))
    const m = calculateMetrics(coords, 'hiking')
    expect(m.elevationGain).toBe(100)
    expect(m.elevationLoss).toBe(100)
    expect(m.elevationMax).toBe(1100)
    expect(m.elevationMin).toBe(1000)
  })

  it('ignores missing elevation instead of treating it as 0 m', () => {
    const coords = line(5, i => (i === 2 ? undefined : 2000))
    const m = calculateMetrics(coords, 'running')
    expect(m.elevationGain).toBe(0)
    expect(m.elevationMin).toBe(2000)
  })

  it('filters sub-threshold jitter', () => {
    const coords = line(100, i => 1500 + (i % 2))   // ±1 m noise
    expect(calculateMetrics(coords, 'hiking').elevationGain).toBe(0)
  })

  it('handles very large tracks without stack overflow', () => {
    const coords = line(300_000, i => 1000 + Math.sin(i / 1000) * 200)
    expect(() => calculateMetrics(coords, 'cycling')).not.toThrow()
  })

  it('returns zeros when no elevation data', () => {
    const m = calculateMetrics(line(3, () => undefined), 'hiking')
    expect(m.elevationMax).toBe(0)
    expect(m.elevationGain).toBe(0)
  })

  it('estimates longer time for hiking than cycling', () => {
    const coords = line(50, i => 1000 + i * 5)
    expect(calculateMetrics(coords, 'hiking').estimatedTime)
      .toBeGreaterThan(calculateMetrics(coords, 'cycling').estimatedTime)
  })
})

describe('buildElevationProfile', () => {
  it('accumulates distance and clamps gradient', () => {
    const p = buildElevationProfile([{ lat: 0, lng: 0, elevation: 0 }, { lat: 0.0001, lng: 0, elevation: 1000 }])
    expect(p).toHaveLength(2)
    expect(p[1].gradient).toBe(45)
  })
})

describe('formatTime', () => {
  it('formats hours and minutes', () => {
    expect(formatTime(135)).toMatch(/2.*15/)
  })
})

describe('exportGPX', () => {
  it('escapes XML in the route name', () => {
    const route = {
      id: 'x', name: 'A & B <test>', activityType: 'hiking', coordinates: line(2, () => 10),
      waypoints: [], createdAt: 0, color: '#f97316', tags: [],
    } as Route
    const gpx = exportGPX(route)
    expect(gpx).toContain('A &amp; B &lt;test&gt;')
    expect(gpx.match(/<trkpt/g)).toHaveLength(2)
  })
})

describe('nanoid', () => {
  it('produces url-safe unique ids accepted by the API', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => nanoid()))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/)
  })
})
