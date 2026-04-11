import { useEffect } from 'react'
import { useRouteStore } from '../store/routeStore'
import { fetchElevations } from '../services/elevationService'

const fetchedIds = new Set<string>()

async function loadElevation(routeId: string) {
  const { routes, updateRouteCoords, setElevationLoading } = useRouteStore.getState()
  const route = routes.find(r => r.id === routeId)
  if (!route || route.coordinates.length < 2) return

  setElevationLoading(routeId)
  try {
    const withElevation = await fetchElevations(route.coordinates)
    const hasData = withElevation.some(c => (c.elevation ?? 0) !== 0)
    if (hasData) {
      fetchedIds.add(routeId)
      useRouteStore.getState().updateRouteCoords(routeId, withElevation)
    }
  } catch (e) {
    console.error('Elevation fetch failed', e)
  } finally {
    useRouteStore.getState().setElevationLoading(null)
  }
}

export function refreshElevationForRoute(routeId: string) {
  fetchedIds.delete(routeId)
  loadElevation(routeId)
}

export function useElevationFetch() {
  const { routes, activeRouteId } = useRouteStore()

  useEffect(() => {
    if (!activeRouteId) return

    const route = routes.find(r => r.id === activeRouteId)
    if (!route || route.coordinates.length < 2) return

    const hasElevation = route.coordinates.some(c => c.elevation != null && c.elevation !== 0)
    if (hasElevation) return
    if (fetchedIds.has(route.id)) return

    loadElevation(route.id)
  }, [activeRouteId, routes])
}
