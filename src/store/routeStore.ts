import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Route, Coordinate, ActivityType } from '../types/route'
import { nanoid } from '../utils/nanoid'
import { randomRouteColor } from '../utils/gpxParser'
import { calculateMetrics } from '../utils/routeMetrics'

interface RouteStore {
  routes: Route[]
  activeRouteId: string | null
  drawingCoords: Coordinate[]
  isDrawing: boolean
  drawingActivityType: ActivityType
  elevationLoadingId: string | null
  snappingRouteId: string | null
  snappingProgress: number

  saveRoute: (route: Route) => void
  deleteRoute: (id: string) => void
  setActiveRoute: (id: string | null) => void
  updateRouteCoords: (id: string, coords: Coordinate[]) => void
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

export const useRouteStore = create<RouteStore>()(
  persist(
    (set, get) => ({
      routes: [],
      activeRouteId: null,
      drawingCoords: [],
      isDrawing: false,
      drawingActivityType: 'hiking',
      elevationLoadingId: null,
      snappingRouteId: null,
      snappingProgress: 0,

      saveRoute: (route) =>
        set(state => ({
          routes: state.routes.some(r => r.id === route.id)
            ? state.routes.map(r => (r.id === route.id ? route : r))
            : [...state.routes, route],
          activeRouteId: route.id,
        })),

      deleteRoute: (id) =>
        set(state => ({
          routes: state.routes.filter(r => r.id !== id),
          activeRouteId: state.activeRouteId === id ? null : state.activeRouteId,
        })),

      setActiveRoute: (id) => set({ activeRouteId: id }),

      updateRouteCoords: (id, coords) =>
        set(state => ({
          routes: state.routes.map(r =>
            r.id === id
              ? { ...r, coordinates: coords, metrics: calculateMetrics(coords, r.activityType) }
              : r
          ),
        })),

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

        return route
      },

      setDrawingCoords: (coords) => set({ drawingCoords: coords }),
    }),
    { name: 'rutasmap-routes' }
  )
)
