import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useMapStore } from '../store/mapStore'
import { useRouteStore } from '../store/routeStore'
import type { Coordinate } from '../types/route'

const VERTEX_SOURCE = 'edit-vertices'
const MID_SOURCE    = 'edit-midpoints'
const VERTEX_LAYER  = 'edit-vertex-layer'
const MID_LAYER     = 'edit-mid-layer'
const HIT_LAYER     = 'edit-vertex-hit'   // invisible wider hit area

function midpoint(a: Coordinate, b: Coordinate): Coordinate {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

function buildVertexGeoJSON(coords: Coordinate[]) {
  return {
    type: 'FeatureCollection' as const,
    features: coords.map((c, i) => ({
      type: 'Feature' as const,
      id: i,
      geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
      properties: { index: i, kind: 'vertex' },
    })),
  }
}

function buildMidGeoJSON(coords: Coordinate[]) {
  return {
    type: 'FeatureCollection' as const,
    features: coords.slice(0, -1).map((c, i) => {
      const m = midpoint(c, coords[i + 1])
      return {
        type: 'Feature' as const,
        id: i,
        geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
        properties: { index: i, kind: 'mid' },  // insert after index i
      }
    }),
  }
}

function setupEditLayers(map: maplibregl.Map) {
  if (!map.getSource(VERTEX_SOURCE)) {
    map.addSource(VERTEX_SOURCE, { type: 'geojson', data: buildVertexGeoJSON([]) })
  }
  if (!map.getSource(MID_SOURCE)) {
    map.addSource(MID_SOURCE, { type: 'geojson', data: buildMidGeoJSON([]) })
  }

  if (!map.getLayer(MID_LAYER)) {
    map.addLayer({
      id: MID_LAYER,
      type: 'circle',
      source: MID_SOURCE,
      paint: {
        'circle-radius': 6,
        'circle-color': '#fff',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#f97316',
        'circle-opacity': 0.7,
      },
    })
  }

  if (!map.getLayer(VERTEX_LAYER)) {
    map.addLayer({
      id: VERTEX_LAYER,
      type: 'circle',
      source: VERTEX_SOURCE,
      paint: {
        'circle-radius': 7,
        'circle-color': '#f97316',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })
  }

  // Invisible hit area (larger radius) for easier clicking
  if (!map.getLayer(HIT_LAYER)) {
    map.addLayer({
      id: HIT_LAYER,
      type: 'circle',
      source: VERTEX_SOURCE,
      paint: { 'circle-radius': 14, 'circle-opacity': 0 },
    })
  }
}

function removeEditLayers(map: maplibregl.Map) {
  ;[HIT_LAYER, VERTEX_LAYER, MID_LAYER].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  ;[VERTEX_SOURCE, MID_SOURCE].forEach(id => {
    if (map.getSource(id)) map.removeSource(id)
  })
}

function updateSources(map: maplibregl.Map, coords: Coordinate[]) {
  const vs = map.getSource(VERTEX_SOURCE) as maplibregl.GeoJSONSource | undefined
  const ms = map.getSource(MID_SOURCE) as maplibregl.GeoJSONSource | undefined
  vs?.setData(buildVertexGeoJSON(coords) as GeoJSON.FeatureCollection)
  ms?.setData(buildMidGeoJSON(coords) as GeoJSON.FeatureCollection)
}

export function useRouteEditor(mapRef: React.RefObject<maplibregl.Map | null>) {
  const { editingRouteId, setEditingRouteId } = useMapStore()
  const { routes, updateRouteCoords } = useRouteStore()
  const dragging = useRef<{ kind: 'vertex' | 'mid'; index: number } | null>(null)
  const coordsRef = useRef<Coordinate[]>([])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!editingRouteId) {
      removeEditLayers(map)
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
      return
    }

    const route = routes.find(r => r.id === editingRouteId)
    if (!route) return

    coordsRef.current = [...route.coordinates]

    if (!map.isStyleLoaded()) {
      map.once('load', () => setupEditLayers(map))
    } else {
      setupEditLayers(map)
    }

    updateSources(map, coordsRef.current)

    // Hover cursor on handles
    const onMouseEnterVertex = () => { map.getCanvas().style.cursor = 'grab' }
    const onMouseEnterMid    = () => { map.getCanvas().style.cursor = 'crosshair' }
    const onMouseLeaveHandle = () => { map.getCanvas().style.cursor = '' }

    map.on('mouseenter', HIT_LAYER, onMouseEnterVertex)
    map.on('mouseenter', MID_LAYER,  onMouseEnterMid)
    map.on('mouseleave', HIT_LAYER, onMouseLeaveHandle)
    map.on('mouseleave', MID_LAYER,  onMouseLeaveHandle)

    // Start drag on vertex
    const onMouseDownVertex = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      e.preventDefault()
      if (!e.features?.length) return
      const idx = e.features[0].properties.index as number
      dragging.current = { kind: 'vertex', index: idx }
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'grabbing'
    }

    // Start drag on midpoint → insert new point
    const onMouseDownMid = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      e.preventDefault()
      if (!e.features?.length) return
      const idx = e.features[0].properties.index as number
      // Insert midpoint into coords
      const newCoord: Coordinate = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      const newCoords = [
        ...coordsRef.current.slice(0, idx + 1),
        newCoord,
        ...coordsRef.current.slice(idx + 1),
      ]
      coordsRef.current = newCoords
      updateSources(map, newCoords)
      // Now drag the newly inserted point
      dragging.current = { kind: 'vertex', index: idx + 1 }
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'grabbing'
    }

    // Move dragged point
    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!dragging.current) return
      const { index } = dragging.current
      const newCoords = [...coordsRef.current]
      newCoords[index] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      coordsRef.current = newCoords

      // Update handles in real-time
      updateSources(map, newCoords)

      // Update route line in real-time
      const lineSource = map.getSource(`route-${editingRouteId}`) as maplibregl.GeoJSONSource | undefined
      lineSource?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: newCoords.map(c => [c.lng, c.lat]) },
        properties: {},
      } as GeoJSON.Feature)
    }

    // Finish drag → save
    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = null
      map.dragPan.enable()
      map.getCanvas().style.cursor = 'grab'
      updateRouteCoords(editingRouteId, coordsRef.current)
    }

    map.on('mousedown', HIT_LAYER, onMouseDownVertex)
    map.on('mousedown', MID_LAYER,  onMouseDownMid)
    map.on('mousemove', onMouseMove)
    map.on('mouseup',   onMouseUp)

    return () => {
      map.off('mouseenter', HIT_LAYER, onMouseEnterVertex)
      map.off('mouseenter', MID_LAYER,  onMouseEnterMid)
      map.off('mouseleave', HIT_LAYER, onMouseLeaveHandle)
      map.off('mouseleave', MID_LAYER,  onMouseLeaveHandle)
      map.off('mousedown', HIT_LAYER, onMouseDownVertex)
      map.off('mousedown', MID_LAYER,  onMouseDownMid)
      map.off('mousemove', onMouseMove)
      map.off('mouseup',   onMouseUp)
      removeEditLayers(map)
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
    }
  }, [editingRouteId, routes])
}
