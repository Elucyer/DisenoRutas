import { create } from 'zustand'
import type { Route, Coordinate, ActivityType } from '../types/route'
import { nanoid } from '../utils/nanoid'
import { randomRouteColor } from '../utils/gpxParser'
import { calculateMetrics } from '../utils/routeMetrics'

const API = import.meta.env.DEV ? '/strava-api' : ''

async function apiSaveRoute(route: Route) {
  await fetch(`${API}/api/routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(route),
  })
}

async function apiDeleteRoute(id: string) {
  await fetch(`${API}/api/routes/${id}`, { method: 'DELETE' })
}

export async function fetchRoutesFromDB(): Promise<Route[]> {
  const res = await fetch(`${API}/api/routes`)
  if (!res.ok) return []
  return res.json()
}

interface RouteStore {
  routes: Route[]
  activeRouteId: string | null
  drawingCoords: Coordinate[]
  isDrawing: boolean
  drawingActivityType: ActivityType
  elevationLoadingId: string | null
  snappingRouteId: string | null
  snappingProgress: number

  loadRoutes: () => Promise<void>
  saveRoute: (route: Route) => void
  deleteRoute: (id: string) => void
  setActiveRoute: (id: string | null) => void
  updateRouteCoords: (id: string, coords: Coordinate[], preserveTime?: boolean) => void
  setElevationLoading: (id: string | null) => void
  setSnappingRoute: (id: string | null, progress?: number) => void

  startDrawing: (activityType: ActivityType) => void
  addDrawingPoint: (coord: Coordinate) => void
  addDrawingPoints: (coords: Coordinate[]) => void
  undoLastPoint: () => void
  cancelDrawing: () => void
  finishDrawing: (name: string) => Route | null
  setDrawingCoords: (coords: Coordinate[]) => void
}

export const useRouteStore = create<RouteStore>()((set, get) => ({
  routes: [],
  activeRouteId: null,
  drawingCoords: [],
  isDrawing: false,
  drawingActivityType: 'hiking',
  elevationLoadingId: null,
  snappingRouteId: null,
  snappingProgress: 0,

  loadRoutes: async () => {
    try {
      const routes = await fetchRoutesFromDB()
      set({ routes })
    } catch (e) {
      console.error('Error cargando rutas:', e)
    }
  },

  saveRoute: (route) => {
    set(state => ({
      routes: state.routes.some(r => r.id === route.id)
        ? state.routes.map(r => (r.id === route.id ? route : r))
        : [...state.routes, route],
      activeRouteId: route.id,
    }))
    apiSaveRoute(route).catch(console.error)
  },

  deleteRoute: (id) => {
    set(state => ({
      routes: state.routes.filter(r => r.id !== id),
      activeRouteId: state.activeRouteId === id ? null : state.activeRouteId,
    }))
    apiDeleteRoute(id).catch(console.error)
  },

  setActiveRoute: (id) => set({ activeRouteId: id }),

  updateRouteCoords: (id, coords, preserveTime = false) => {
    set(state => ({
      routes: state.routes.map(r => {
        if (r.id !== id) return r
        const newMetrics = calculateMetrics(coords, r.activityType)
        // Keep real moving time if it was set from Strava
        if (preserveTime && r.metrics?.estimatedTime) {
          newMetrics.estimatedTime = r.metrics.estimatedTime
        }
        return { ...r, coordinates: coords, metrics: newMetrics }
      }),
    }))
    const route = get().routes.find(r => r.id === id)
    if (route) apiSaveRoute(route).catch(console.error)
  },

  setElevationLoading: (id) => set({ elevationLoadingId: id }),

  setSnappingRoute: (id, progress = 0) =>
    set({ snappingRouteId: id, snappingProgress: progress }),

  startDrawing: (activityType) =>
    set({ isDrawing: true, drawingCoords: [], drawingActivityType: activityType }),

  addDrawingPoint: (coord) =>
    set(state => ({ drawingCoords: [...state.drawingCoords, coord] })),

  addDrawingPoints: (coords: Coordinate[]) =>
    set(state => ({ drawingCoords: [...state.drawingCoords, ...coords] })),

  undoLastPoint: () =>
    set(state => ({ drawingCoords: state.drawingCoords.slice(0, -1) })),

  cancelDrawing: () =>
    set({ isDrawing: false, drawingCoords: [] }),

  finishDrawing: (name) => {
    const { drawingCoords, drawingActivityType } = get()
    if (drawingCoords.length < 2) return null

    const route: Route = {
      id: nanoid(),
      name,
      activityType: drawingActivityType,
      coordinates: drawingCoords,
      waypoints: [],
      color: randomRouteColor(),
      tags: [],
      createdAt: Date.now(),
      metrics: calculateMetrics(drawingCoords, drawingActivityType),
    }

    set(state => ({
      routes: [...state.routes, route],
      activeRouteId: route.id,
      isDrawing: false,
      drawingCoords: [],
    }))

    apiSaveRoute(route).catch(console.error)
    return route
  },

  setDrawingCoords: (coords) => set({ drawingCoords: coords }),
}))
