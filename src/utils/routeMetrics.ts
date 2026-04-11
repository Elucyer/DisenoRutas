import type { Coordinate, RouteMetrics, ElevationPoint, ActivityType, DifficultyLevel } from '../types/route'
import { haversineDistance, totalDistance } from './geometry'

export function buildElevationProfile(coords: Coordinate[]): ElevationPoint[] {
  const points: ElevationPoint[] = []
  let cumulativeDist = 0

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      cumulativeDist += haversineDistance(coords[i - 1], coords[i])
    }

    const elevation = coords[i].elevation ?? 0
    let gradient = 0

    if (i > 0) {
      const prevElev = coords[i - 1].elevation ?? 0
      const segDist = haversineDistance(coords[i - 1], coords[i]) * 1000 // m
      gradient = segDist > 0 ? ((elevation - prevElev) / segDist) * 100 : 0
      gradient = Math.max(-45, Math.min(45, gradient))
    }

    points.push({
      distance: Math.round(cumulativeDist * 100) / 100,
      elevation,
      gradient: Math.round(gradient * 10) / 10,
      lat: coords[i].lat,
      lng: coords[i].lng,
    })
  }

  return points
}

export function calculateMetrics(coords: Coordinate[], activityType: ActivityType): RouteMetrics {
  const distance = totalDistance(coords)
  const elevations = coords.map(c => c.elevation ?? 0)

  let elevationGain = 0
  let elevationLoss = 0

  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1]
    if (diff > 0) elevationGain += diff
    else elevationLoss += Math.abs(diff)
  }

  const elevationMax = Math.max(...elevations)
  const elevationMin = Math.min(...elevations)

  const estimatedTime = estimateTime(distance, elevationGain, activityType)
  const difficulty = calculateDifficulty(distance, elevationGain, elevations)
  const kcal = estimateKcal(distance, elevationGain, activityType)

  return {
    distance: Math.round(distance * 100) / 100,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    elevationMax: Math.round(elevationMax),
    elevationMin: Math.round(elevationMin),
    estimatedTime,
    difficulty,
    kcal,
  }
}

function estimateTime(distanceKm: number, elevGainM: number, activityType: ActivityType): number {
  // Naismith's rule adapted per activity
  const speeds: Record<ActivityType, number> = {
    running: 8,    // km/h on flat
    cycling: 20,
    hiking: 4,
  }
  const climbRates: Record<ActivityType, number> = {
    running: 600,  // m/h climbing penalty
    cycling: 400,
    hiking: 300,
  }
  const baseTime = (distanceKm / speeds[activityType]) * 60
  const climbTime = (elevGainM / climbRates[activityType]) * 60
  return Math.round(baseTime + climbTime)
}

function calculateDifficulty(distKm: number, elevGainM: number, elevations: number[]): DifficultyLevel {
  const gradients: number[] = []
  for (let i = 1; i < elevations.length; i++) {
    gradients.push(Math.abs(elevations[i] - elevations[i - 1]))
  }
  const maxGradient = gradients.length > 0 ? Math.max(...gradients) : 0

  const score = distKm * 1 + (elevGainM / 1000) * 10 + (maxGradient / 10) * 0.5

  if (score < 5) return 'easy'
  if (score < 15) return 'moderate'
  if (score < 30) return 'challenging'
  if (score < 50) return 'strenuous'
  return 'expert'
}

function estimateKcal(distKm: number, elevGainM: number, activityType: ActivityType): number {
  const metValues: Record<ActivityType, number> = {
    running: 10,
    cycling: 7,
    hiking: 5.5,
  }
  const weightKg = 70 // assumed average
  const met = metValues[activityType]
  const hours = distKm / (activityType === 'cycling' ? 20 : activityType === 'running' ? 8 : 4)
  const climbBonus = (elevGainM / 100) * 50
  return Math.round(met * weightKg * hours + climbBonus)
}

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Fácil',
  moderate: 'Moderado',
  challenging: 'Difícil',
  strenuous: 'Muy difícil',
  expert: 'Experto',
}

export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  easy: '#22c55e',
  moderate: '#84cc16',
  challenging: '#f59e0b',
  strenuous: '#ef4444',
  expert: '#7c3aed',
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: 'Running',
  cycling: 'Ciclismo',
  hiking: 'Senderismo',
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  return `${h}h ${m}min`
}

export function gradientColor(gradient: number): string {
  const abs = Math.abs(gradient)
  if (abs < 5) return '#22c55e'
  if (abs < 10) return '#84cc16'
  if (abs < 15) return '#f59e0b'
  if (abs < 20) return '#ef4444'
  return '#7c3aed'
}
