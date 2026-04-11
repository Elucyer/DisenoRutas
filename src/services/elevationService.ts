import type { Coordinate } from '../types/route'

/**
 * Decodifica elevacion directamente desde tiles Terrarium de AWS.
 * Gratis, sin API key, sin CORS issues (S3 tiene Access-Control-Allow-Origin: *).
 * Encoding: elevation = R*256 + G + B/256 - 32768
 */

const TERRARIUM_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const ZOOM = 12

interface Tile { x: number; y: number; z: number }

function coordToTile(lng: number, lat: number, z: number): Tile {
  const x = Math.floor((lng + 180) / 360 * (1 << z))
  const latRad = lat * Math.PI / 180
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * (1 << z)
  )
  return { x, y, z }
}

function coordToPixel(lng: number, lat: number, tile: Tile): { px: number; py: number } {
  const scale = 1 << tile.z
  const px = Math.floor(((lng + 180) / 360 * scale - tile.x) * 256)
  const latRad = lat * Math.PI / 180
  const py = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale - tile.y) * 256
  )
  return {
    px: Math.min(255, Math.max(0, px)),
    py: Math.min(255, Math.max(0, py)),
  }
}

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

// Cache de tiles ya cargados (clave: "z/x/y")
const tileCache = new Map<string, ImageData>()

async function loadTile(tile: Tile): Promise<ImageData | null> {
  const key = `${tile.z}/${tile.x}/${tile.y}`
  if (tileCache.has(key)) return tileCache.get(key)!

  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `${TERRARIUM_BASE}/${key}.png`

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      try {
        const imageData = ctx.getImageData(0, 0, 256, 256)
        tileCache.set(key, imageData)
        resolve(imageData)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
  })
}

export async function fetchElevations(coords: Coordinate[]): Promise<Coordinate[]> {
  if (coords.length === 0) return coords

  // Agrupar coordenadas por tile para minimizar fetches
  const tileGroups = new Map<string, { tile: Tile; indices: number[] }>()

  for (let i = 0; i < coords.length; i++) {
    const tile = coordToTile(coords[i].lng, coords[i].lat, ZOOM)
    const key = `${tile.z}/${tile.x}/${tile.y}`
    if (!tileGroups.has(key)) tileGroups.set(key, { tile, indices: [] })
    tileGroups.get(key)!.indices.push(i)
  }

  // Cargar todos los tiles en paralelo
  const tileData = new Map<string, ImageData | null>()
  await Promise.all(
    Array.from(tileGroups.entries()).map(async ([key, { tile }]) => {
      const data = await loadTile(tile)
      tileData.set(key, data)
    })
  )

  // Leer elevacion de cada coordenada
  return coords.map((coord, i) => {
    const tile = coordToTile(coord.lng, coord.lat, ZOOM)
    const key = `${tile.z}/${tile.x}/${tile.y}`
    const imageData = tileData.get(key)
    if (!imageData) return coord

    const { px, py } = coordToPixel(coord.lng, coord.lat, tile)
    const idx = (py * 256 + px) * 4
    const elevation = decodeTerrarium(
      imageData.data[idx],
      imageData.data[idx + 1],
      imageData.data[idx + 2]
    )
    return { ...coord, elevation: Math.round(elevation) }
  })
}
