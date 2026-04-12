import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PrivacyZone {
  lat: number
  lng: number
  radiusM: number  // meters
}

export type BaseLayer = 'liberty' | 'bright' | 'topo' | 'satellite'

export interface FlyToRequest {
  lng: number
  lat: number
  zoom: number
  id: number  // incremental id so same coord triggers re-fly
}

interface MapStore {
  baseLayer: BaseLayer
  showWeather: boolean
  hoverDistanceKm: number | null
  snapToRoad: boolean
  isSnapping: boolean
  flyToRequest: FlyToRequest | null
  eraserActive: boolean
  eraserRadius: number
  editingRouteId: string | null
  privacyZone: PrivacyZone | null

  setBaseLayer: (layer: BaseLayer) => void
  toggleWeather: () => void
  setHoverDistance: (km: number | null) => void
  toggleSnapToRoad: () => void
  setIsSnapping: (v: boolean) => void
  requestFlyTo: (lng: number, lat: number, zoom: number) => void
  toggleEraser: () => void
  setEraserRadius: (r: number) => void
  setEditingRouteId: (id: string | null) => void
  setPrivacyZone: (zone: PrivacyZone | null) => void
}

export const useMapStore = create<MapStore>()(
  persist(
    set => ({
      baseLayer: 'liberty',
      showWeather: false,
      hoverDistanceKm: null,
      snapToRoad: false,
      isSnapping: false,
      flyToRequest: null,
      eraserActive: false,
      eraserRadius: 150,
      editingRouteId: null,
      privacyZone: null,

      setBaseLayer: (baseLayer) => set({ baseLayer }),
      toggleWeather: () => set(state => ({ showWeather: !state.showWeather })),
      setHoverDistance: (hoverDistanceKm) => set({ hoverDistanceKm }),
      toggleSnapToRoad: () => set(state => ({ snapToRoad: !state.snapToRoad })),
      setIsSnapping: (isSnapping) => set({ isSnapping }),
      toggleEraser: () => set(state => ({ eraserActive: !state.eraserActive })),
      setEraserRadius: (eraserRadius) => set({ eraserRadius }),
      setEditingRouteId: (editingRouteId) => set({ editingRouteId }),
      setPrivacyZone: (privacyZone) => set({ privacyZone }),
      requestFlyTo: (lng, lat, zoom) =>
        set(state => ({ flyToRequest: { lng, lat, zoom, id: (state.flyToRequest?.id ?? 0) + 1 } })),
    }),
    { name: 'rutasmap-settings', partialize: (s) => ({ privacyZone: s.privacyZone }) }
  )
)
