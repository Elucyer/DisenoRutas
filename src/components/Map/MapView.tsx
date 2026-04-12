import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { getBounds, haversineDistance } from '../../utils/geometry'
import { snapToRoad } from '../../services/routingService'
import { buildElevationProfile } from '../../utils/routeMetrics'
import { setMapInstance } from '../../services/mapInstance'
import { useRouteEditor } from '../../hooks/useRouteEditor'
import type { Route, Coordinate } from '../../types/route'
import type { PrivacyZone } from '../../store/mapStore'

// OpenFreeMap styles (completely free, no API key)
// OpenTopoMap for topo, ESRI for satellite
export const BASE_STYLES: Record<string, string | object> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright:  'https://tiles.openfreemap.org/styles/bright',
  topo: {
    version: 8,
    sources: {
      'osm-topo': {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenTopoMap (CC-BY-SA)',
        maxzoom: 17,
      },
    },
    layers: [{ id: 'osm-topo-layer', type: 'raster', source: 'osm-topo' }],
  },
  satellite: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Tiles © Esri',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' }],
  },
}

export function MapView() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { routes, activeRouteId, isDrawing, drawingCoords, addDrawingPoint, addDrawingPoints, drawingActivityType } = useRouteStore()
  const { baseLayer, snapToRoad: snapEnabled, setIsSnapping, hoverDistanceKm, flyToRequest, eraserActive, eraserRadius, privacyZone, showRoutes } = useMapStore()
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null)
  const eraserCircleRef = useRef<HTMLDivElement | null>(null)
  const isDraggingRef = useRef(false)

  useRouteEditor(mapRef)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLES['liberty'] as string,
      center: [-74.297, 4.571], // Colombia fallback
      zoom: 6,
    })

    // Center on user's location as soon as possible
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          map.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 12,
            duration: 1500,
          })
        },
        () => {
          // Permission denied or error — keep fallback center
        },
        { timeout: 8000, maximumAge: 60000 }
      )
    }

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'top-right')

    map.on('load', () => {
      renderAllRoutes(map, routes, activeRouteId, privacyZone)
    })

    // Click on a route line → select it
    map.on('click', (e) => {
      if (useRouteStore.getState().isDrawing) return
      const features = map.queryRenderedFeatures(e.point, {
        layers: map.getStyle()?.layers
          ?.map(l => l.id)
          .filter(id => id.startsWith('route-line-') && !id.endsWith('-shadow')) ?? [],
      })
      if (features.length > 0) {
        const routeId = features[0].properties?.routeId as string | undefined
        if (routeId) {
          useRouteStore.getState().setActiveRoute(routeId)
          e.preventDefault()
        }
      }
    })

    // Pointer cursor on hover over route lines
    map.on('mousemove', (e) => {
      const { isDrawing } = useRouteStore.getState()
      const { eraserActive } = useMapStore.getState()
      if (isDrawing || eraserActive) return
      const style = map.getStyle()
      const routeLayers = style?.layers
        ?.map(l => l.id)
        .filter(id => id.startsWith('route-line-') && !id.endsWith('-shadow')) ?? []
      if (routeLayers.length === 0) return
      const features = map.queryRenderedFeatures(e.point, { layers: routeLayers })
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : ''
    })

    mapRef.current = map
    setMapInstance(map)
    return () => { map.remove(); mapRef.current = null; setMapInstance(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle click for drawing
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      const store = useRouteStore.getState()
      if (!store.isDrawing) return

      const newCoord = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      const { snapToRoad: snap, setIsSnapping } = useMapStore.getState()
      const prevCoords = store.drawingCoords

      if (snap && prevCoords.length > 0) {
        const from = prevCoords[prevCoords.length - 1]
        setIsSnapping(true)
        try {
          const snapped = await snapToRoad(from, newCoord, store.drawingActivityType)
          // skip first point (already in the list), add the rest
          store.addDrawingPoints(snapped.slice(1))
        } catch {
          store.addDrawingPoint(newCoord)
        } finally {
          setIsSnapping(false)
        }
      } else {
        addDrawingPoint(newCoord)
      }
    }

    map.on('click', handleClick)
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : ''
    return () => { map.off('click', handleClick) }
  }, [isDrawing, addDrawingPoint, addDrawingPoints, snapEnabled, setIsSnapping, drawingActivityType])

  // Render drawing preview
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const sourceId = 'drawing-preview'

    const update = () => {
      if (map.getLayer('drawing-preview-layer')) map.removeLayer('drawing-preview-layer')
      if (map.getLayer('drawing-dots')) map.removeLayer('drawing-dots')
      if (map.getSource(sourceId)) map.removeSource(sourceId)

      if (drawingCoords.length < 1) return

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: drawingCoords.map(c => [c.lng, c.lat]) },
              properties: {},
            },
            {
              type: 'Feature',
              geometry: { type: 'MultiPoint', coordinates: drawingCoords.map(c => [c.lng, c.lat]) },
              properties: {},
            },
          ],
        },
      })

      map.addLayer({
        id: 'drawing-preview-layer',
        type: 'line',
        source: sourceId,
        filter: ['==', '$type', 'LineString'],
        paint: { 'line-color': '#f97316', 'line-width': 3, 'line-dasharray': [2, 2] },
      })

      map.addLayer({
        id: 'drawing-dots',
        type: 'circle',
        source: sourceId,
        filter: ['==', '$type', 'MultiPoint'],
        paint: { 'circle-radius': 5, 'circle-color': '#f97316', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      })
    }

    if (map.isStyleLoaded()) update()
    else map.once('load', update)
  }, [drawingCoords])

  // Render saved routes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Si las rutas están ocultas pero hay una activa, mostrar solo esa
    const visibleRoutes = showRoutes ? routes : activeRouteId ? routes.filter(r => r.id === activeRouteId) : []
    const render = () => renderAllRoutes(map, visibleRoutes, activeRouteId, privacyZone)
    if (map.isStyleLoaded()) render()
    else map.once('load', render)
  }, [routes, activeRouteId, privacyZone, showRoutes])

  // Base layer change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = BASE_STYLES[baseLayer]
    map.setStyle(style as string)
    map.once('styledata', () => {
      const { routes, activeRouteId } = useRouteStore.getState()
      const { privacyZone, showRoutes } = useMapStore.getState()
      const visibleRoutes = showRoutes ? routes : activeRouteId ? routes.filter(r => r.id === activeRouteId) : []
      renderAllRoutes(map, visibleRoutes, activeRouteId, privacyZone)
    })
  }, [baseLayer])

  // Fly to active route
  const flyToRoute = useCallback((route: Route) => {
    const map = mapRef.current
    if (!map || route.coordinates.length === 0) return
    const bounds = getBounds(route.coordinates)
    map.fitBounds(bounds, { padding: 60, duration: 1000 })
  }, [])

  useEffect(() => {
    if (!activeRouteId) return
    const route = useRouteStore.getState().routes.find(r => r.id === activeRouteId)
    if (route) flyToRoute(route)
  }, [activeRouteId, flyToRoute])

  // React to flyToRequest from elevation profile clicks
  useEffect(() => {
    if (!flyToRequest) return
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [flyToRequest.lng, flyToRequest.lat],
      zoom: flyToRequest.zoom,
      duration: 800,
    })
  }, [flyToRequest])

  // Hover marker: move along route when user hovers elevation profile
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (hoverDistanceKm == null) {
      hoverMarkerRef.current?.remove()
      hoverMarkerRef.current = null
      return
    }

    const route = useRouteStore.getState().routes.find(r => r.id === activeRouteId)
    if (!route || route.coordinates.length < 2) return

    const profile = buildElevationProfile(route.coordinates)
    if (profile.length === 0) return

    // Find the profile point closest to hoverDistanceKm
    let closest = profile[0]
    let minDiff = Math.abs(profile[0].distance - hoverDistanceKm)
    for (const pt of profile) {
      const diff = Math.abs(pt.distance - hoverDistanceKm)
      if (diff < minDiff) { minDiff = diff; closest = pt }
    }

    if (!hoverMarkerRef.current) {
      // Create marker element
      const el = document.createElement('div')
      el.style.cssText = `
        width: 14px; height: 14px;
        background: #f97316;
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 3px rgba(249,115,22,0.4), 0 2px 8px rgba(0,0,0,0.5);
        pointer-events: none;
      `
      hoverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([closest.lng, closest.lat])
        .addTo(map)
    } else {
      hoverMarkerRef.current.setLngLat([closest.lng, closest.lat])
    }
  }, [hoverDistanceKm, activeRouteId])

  // Eraser tool
  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container) return

    if (!eraserActive) {
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
      eraserCircleRef.current?.remove()
      eraserCircleRef.current = null
      return
    }

    // Block map panning while eraser is active
    map.dragPan.disable()
    map.getCanvas().style.cursor = 'none'

    // Visual eraser circle (positioned relative to container)
    if (!eraserCircleRef.current) {
      const el = document.createElement('div')
      el.style.cssText = `
        position:absolute; pointer-events:none; z-index:999;
        border:2px dashed #ef4444; border-radius:50%;
        background:rgba(239,68,68,0.12); transform:translate(-50%,-50%);
        display:none;
      `
      container.appendChild(el)
      eraserCircleRef.current = el
    }

    const getCirclePx = (lat: number) => {
      const zoom = map.getZoom()
      const metersPerPx = (40075016.686 * Math.cos(lat * Math.PI / 180)) / (256 * Math.pow(2, zoom))
      return (eraserRadius / metersPerPx) * 2
    }

    const eraseAt = (lngLat: maplibregl.LngLat) => {
      const center = { lat: lngLat.lat, lng: lngLat.lng }
      const radiusKm = eraserRadius / 1000
      const store = useRouteStore.getState()

      if (store.isDrawing) {
        const filtered = store.drawingCoords.filter(c => haversineDistance(c, center) > radiusKm)
        store.setDrawingCoords(filtered)
      } else if (store.activeRouteId) {
        const route = store.routes.find(r => r.id === store.activeRouteId)
        if (!route) return
        const filtered = route.coordinates.filter(c => haversineDistance(c, center) > radiusKm)
        if (filtered.length !== route.coordinates.length) {
          store.updateRouteCoords(route.id, filtered)
        }
      }
    }

    // Use native canvas events so we control everything
    const canvas = map.getCanvas()

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const circle = eraserCircleRef.current
      if (circle) {
        const lngLat = map.unproject([x, y])
        const px = getCirclePx(lngLat.lat)
        circle.style.display = 'block'
        circle.style.width = `${px}px`
        circle.style.height = `${px}px`
        circle.style.left = `${x}px`
        circle.style.top = `${y}px`

        if (isDraggingRef.current) eraseAt(lngLat)
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      isDraggingRef.current = true
      const rect = canvas.getBoundingClientRect()
      eraseAt(map.unproject([e.clientX - rect.left, e.clientY - rect.top]))
    }

    const onMouseUp = (e: MouseEvent) => {
      e.preventDefault()
      isDraggingRef.current = false
    }

    const onMouseLeave = () => {
      if (eraserCircleRef.current) eraserCircleRef.current.style.display = 'none'
      isDraggingRef.current = false
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', onMouseLeave)

    return () => {
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
      eraserCircleRef.current?.remove()
      eraserCircleRef.current = null
      isDraggingRef.current = false
    }
  }, [eraserActive, eraserRadius])

  return <div ref={containerRef} className="w-full h-full" />
}

const markerSet = new Set<string>()
const markerInstances: maplibregl.Marker[] = []

function clearAllMarkers() {
  markerInstances.forEach(m => m.remove())
  markerInstances.length = 0
  markerSet.clear()
}

// Geographic privacy zone — kept for future UI use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function applyPrivacyZone(coords: Coordinate[], zone: { lat: number; lng: number; radiusM: number }): Coordinate[] {
  const inZone = (c: Coordinate) => haversineDistance(c, zone) * 1000 < zone.radiusM

  const startsInZone = coords.length > 0 && inZone(coords[0])
  const endsInZone = coords.length > 0 && inZone(coords[coords.length - 1])

  let start = 0
  let end = coords.length - 1

  if (startsInZone) {
    while (start < coords.length && inZone(coords[start])) start++
  }
  if (endsInZone) {
    while (end >= start && inZone(coords[end])) end--
  }

  return coords.slice(start, end + 1)
}

// Always trim the first PRIVACY_TRIM_M meters from the start of every route
const PRIVACY_TRIM_M = 200

function trimStartDistance(coords: Coordinate[], trimMeters: number): Coordinate[] {
  let accumulated = 0
  for (let i = 1; i < coords.length; i++) {
    accumulated += haversineDistance(coords[i - 1], coords[i]) * 1000
    if (accumulated >= trimMeters) return coords.slice(i)
  }
  return []
}

function renderAllRoutes(map: maplibregl.Map, routes: Route[], activeRouteId: string | null, _privacyZone?: PrivacyZone | null) {
  clearAllMarkers()

  // Remove existing route layers/sources
  const style = map.getStyle()
  if (style?.layers) {
    for (const layer of style.layers) {
      if (typeof layer.id === 'string' && layer.id.startsWith('route-')) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id)
      }
    }
  }
  if (style?.sources) {
    for (const key of Object.keys(style.sources)) {
      if (key.startsWith('route-')) {
        if (map.getSource(key)) map.removeSource(key)
      }
    }
  }

  for (const route of routes) {
    if (route.coordinates.length < 2) continue
    const sourceId = `route-${route.id}`
    const layerId = `route-line-${route.id}`
    const isActive = route.id === activeRouteId
    const isDimmed = activeRouteId !== null && !isActive

    const coords = trimStartDistance(route.coordinates, PRIVACY_TRIM_M)
    if (coords.length < 2) continue

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords.map(c => [c.lng, c.lat]),
          },
          properties: { routeId: route.id },
        },
      })
    }

    if (!map.getLayer(`${layerId}-shadow`)) {
      map.addLayer({
        id: `${layerId}-shadow`,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#000',
          'line-width': isActive ? 8 : 5,
          'line-opacity': isDimmed ? 0.05 : 0.15,
          'line-blur': 3,
        },
      })
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': route.color,
          'line-width': isActive ? 5 : 3,
          'line-opacity': isDimmed ? 0.25 : isActive ? 1 : 0.75,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
    }

    // Show start/end markers only for active route or when no route is selected
    if (!isDimmed && coords.length > 0) {
      addEmojiMarker(map, coords[0].lat, coords[0].lng, '🟢')
      const last = coords[coords.length - 1]
      addEmojiMarker(map, last.lat, last.lng, '🔴')
    }
  }
}

function addEmojiMarker(map: maplibregl.Map, lat: number, lng: number, emoji: string) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (markerSet.has(key)) return
  markerSet.add(key)
  const el = document.createElement('div')
  el.textContent = emoji
  el.style.fontSize = '18px'
  const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
  markerInstances.push(marker)
}
