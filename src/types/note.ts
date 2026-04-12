export interface WaypointNote {
  id: string
  routeId: string
  lat: number
  lng: number
  comment: string
  photo?: string   // base64 JPEG comprimido
  createdAt: number
}
