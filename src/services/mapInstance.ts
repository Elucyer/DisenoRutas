import type maplibregl from 'maplibre-gl'

// Singleton para acceder al mapa desde cualquier hook/servicio
let _map: maplibregl.Map | null = null

export function setMapInstance(map: maplibregl.Map | null) {
  _map = map
}

export function getMapInstance(): maplibregl.Map | null {
  return _map
}

/**
 * Obtiene elevacion de un punto usando los tiles DEM cargados en el mapa.
 * Requiere que el terreno DEM esté configurado en el mapa.
 */
export function getElevationAtPoint(lng: number, lat: number): number {
  if (!_map) return 0
  try {
    return _map.queryTerrainElevation([lng, lat]) ?? 0
  } catch {
    return 0
  }
}
