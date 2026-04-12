export type ActivityType = 'running' | 'cycling' | 'hiking'

export type DifficultyLevel = 'easy' | 'moderate' | 'challenging' | 'strenuous' | 'expert'

export interface Coordinate {
  lng: number
  lat: number
  elevation?: number
}

export interface Waypoint {
  id: string
  coordinate: Coordinate
  name?: string
  type: 'start' | 'end' | 'poi' | 'water' | 'shelter'
}

export interface RouteMetrics {
  distance: number          // km
  elevationGain: number     // m
  elevationLoss: number     // m
  elevationMax: number      // m
  elevationMin: number      // m
  estimatedTime: number     // minutes
  difficulty: DifficultyLevel
  kcal: number
}

export interface Route {
  id: string
  name: string
  activityType: ActivityType
  coordinates: Coordinate[]
  waypoints: Waypoint[]
  metrics?: RouteMetrics
  createdAt: number
  color: string
  description?: string
  tags: string[]
  userId?: string | null
}

export interface ElevationPoint {
  distance: number    // km from start
  elevation: number   // m
  gradient: number    // %
  lat: number
  lng: number
}
