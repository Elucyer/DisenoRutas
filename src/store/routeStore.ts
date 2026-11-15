import { create } from 'zustand'
import type { Route, Coordinate, ActivityType } from '../types/route'
import { nanoid } from '../utils/nanoid'
import { randomRouteColor } from '../utils/gpxParser'
import { calculateMetrics } from '../utils/routeMetrics'
import { useAuthStore } from './authStore'
import { useToastStore } from './toastStore'
import { apiFetch } from '../services/api'

const SAVE_DEBOUNCE_MS = 800
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>()

/** New local routes have userId undefined; legacy DB routes without owner have null (admin only) */
function canEdit(route: Route): boolean {
  const user = useAuthStore.getState().user
  if (!user) return false
  return user.isAdmin || route.userId === undefined || route.userId === user.id
}

function withOwner(route: Route): Route {
  if (route.userId !== undefined) return route
  return { ...route, userId: useAuthStore.getState().user?.id ?? undefined }
}

async function persist(route: Route) {
  try {
    await apiFetch('/api/routes', { method: 'POST', body: JSON.stringify(route) })
  } catch (e) {
    useToastStore.getState().error(`No se pudo guardar "${route.name}": ${(e as Error).message}`)
    useRouteStore.getState().loadRoutes()
  }
}

/** Debounced per route so drags / eraser strokes produce a single request */
function schedulePersist(id: string) {
  const prev = pendingSaves.get(id)
  if (prev) clearTimeout(prev)
  pendingSaves.set(id, setTimeout(() => {
    pendingSaves.delete(id)
    const route = useRouteStore.getState().routes.find(r => r.id === id)
    if (route) persist(route)
  }, SAVE_DEBOUNCE_MS))
}

export async function fetchRoutesFromDB(): Promise<Route[]> {
  return apiFetch<Route[]>('/api/routes')
}

interface RouteStore {
  routes: Route[]
  routesLoading: boolean
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
  routesLoading: false,
  activeRouteId: null,
  drawingCoords: [],
  isDrawing: false,
  drawingActivityType: 'hiking',
  elevationLoadingId: null,
  snappingRouteId: null,
  snappingProgress: 0,

  loadRoutes: async () => {
    set({ routesLoading: true })
    try {
      const routes = await fetchRoutesFromDB()
      set({ routes })
    } catch (e) {
      console.error('Error cargando rutas:', e)
      useToastStore.getState().error('No se pudieron cargar las rutas')
    } finally {
      set({ routesLoading: false })
    }
  },

  saveRoute: (input) => {
    const route = withOwner(input)
    set(state => ({
      routes: state.routes.some(r => r.id === route.id)
        ? state.routes.map(r => (r.id === route.id ? route : r))
        : [...state.routes, route],
      activeRouteId: route.id,
    }))
    if (!canEdit(route)) {
      useToastStore.getState().push('info', 'Inicia sesión como dueño de la ruta para guardar los cambios')
      return
    }
    schedulePersist(route.id)
  },

  deleteRoute: (id) => {
    const previous = get().routes
    const route = previous.find(r => r.id === id)
    set(state => ({
      routes: state.routes.filter(r => r.id !== id),
      activeRouteId: state.activeRouteId === id ? null : state.activeRouteId,
    }))
    const pending = pendingSaves.get(id)
    if (pending) { clearTimeout(pending); pendingSaves.delete(id) }

    apiFetch(`/api/routes/${id}`, { method: 'DELETE' }).catch((e: Error) => {
      set({ routes: previous })
      useToastStore.getState().error(`No se pudo eliminar "${route?.name ?? 'la ruta'}": ${e.message}`)
    })
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
    // Non-owners (e.g. visitors enriching elevation) keep changes local only
    if (route && canEdit(route)) schedulePersist(id)
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

    const route: Route = withOwner({
      id: nanoid(),
      name,
      activityType: drawingActivityType,
      coordinates: drawingCoords,
      waypoints: [],
      color: randomRouteColor(),
      tags: [],
      createdAt: Date.now(),
      metrics: calculateMetrics(drawingCoords, drawingActivityType),
    })

    set(state => ({
      routes: [...state.routes, route],
      activeRouteId: route.id,
      isDrawing: false,
      drawingCoords: [],
    }))

    if (canEdit(route)) persist(route)
    else useToastStore.getState().push('info', 'Inicia sesión para guardar la ruta en tu cuenta')
    return route
  },

  setDrawingCoords: (coords) => set({ drawingCoords: coords }),
}))
