import { useState, useRef, useEffect, useCallback } from 'react'
import { getMapInstance } from '../../services/mapInstance'
import { authHeader, useAuthStore } from '../../store/authStore'
import maplibregl from 'maplibre-gl'

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
  importance: number
}

// Shared character classes for reuse in patterns
const D = `[°º]`          // degree symbol variants
const M = `['′'ʼ]`        // minute symbol variants
const S = `["″"ʺ]`        // second symbol variants
const SEP = `[,;\\s]`     // separator between lat and lng

// Helpers
const sign = (dir: string) => /[SsWw]/.test(dir) ? -1 : 1
const toDD = (deg: string, min = '0', sec = '0') =>
  parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600

function parseCoords(raw: string): { lat: number; lng: number } | null {
  const q = raw.trim()

  // ── 1. Decimal degrees, signed or with cardinal ──────────────────────────
  // e.g.  4.71, -74.07 | -48.877, -123.393 | 48.877S 123.393W | N4.71 W74.07
  const dd = q.match(
    new RegExp(
      `^([NSns])?\\s*(-?\\d+(?:\\.\\d+)?)${D}?\\s*([NSns])?` +
      `${SEP}+` +
      `([EWew])?\\s*(-?\\d+(?:\\.\\d+)?)${D}?\\s*([EWew])?$`
    )
  )
  if (dd) {
    const latDir = dd[1] || dd[3] || ''
    const lngDir = dd[4] || dd[6] || ''
    const lat = parseFloat(dd[2]) * (latDir ? sign(latDir) : 1)
    const lng = parseFloat(dd[5]) * (lngDir ? sign(lngDir) : 1)
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng }
  }

  // ── 2. DMS with cardinal  63° 2' 56.73" S, 60° 57' 32.38" W ─────────────
  const dms = q.match(
    new RegExp(
      `(\\d+)\\s*${D}\\s*(\\d+)\\s*${M}\\s*(\\d+(?:\\.\\d+)?)\\s*${S}?\\s*([NSns])` +
      `${SEP}+` +
      `(\\d+)\\s*${D}\\s*(\\d+)\\s*${M}\\s*(\\d+(?:\\.\\d+)?)\\s*${S}?\\s*([EWew])`
    )
  )
  if (dms) {
    const lat = toDD(dms[1], dms[2], dms[3]) * sign(dms[4])
    const lng = toDD(dms[5], dms[6], dms[7]) * sign(dms[8])
    return { lat, lng }
  }

  // ── 3. DM with cardinal  48° 52.6′ S, 123° 23.6′ W ──────────────────────
  const dm = q.match(
    new RegExp(
      `(\\d+)\\s*${D}\\s*(\\d+(?:\\.\\d+)?)\\s*${M}?\\s*([NSns])` +
      `${SEP}+` +
      `(\\d+)\\s*${D}\\s*(\\d+(?:\\.\\d+)?)\\s*${M}?\\s*([EWew])`
    )
  )
  if (dm) {
    const lat = toDD(dm[1], dm[2]) * sign(dm[3])
    const lng = toDD(dm[4], dm[5]) * sign(dm[6])
    return { lat, lng }
  }

  // ── 4. Degrees only with cardinal  48°S 123°W ────────────────────────────
  const dOnly = q.match(
    new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*${D}\\s*([NSns])` +
      `${SEP}+` +
      `(\\d+(?:\\.\\d+)?)\\s*${D}\\s*([EWew])`
    )
  )
  if (dOnly) {
    const lat = parseFloat(dOnly[1]) * sign(dOnly[2])
    const lng = parseFloat(dOnly[3]) * sign(dOnly[4])
    return { lat, lng }
  }

  // ── 5. Compact DDMMSS  632856S 0605732W ──────────────────────────────────
  const compact = q.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NSns])\s*(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([EWew])$/)
  if (compact) {
    const lat = toDD(compact[1], compact[2], compact[3]) * sign(compact[4])
    const lng = toDD(compact[5], compact[6], compact[7]) * sign(compact[8])
    return { lat, lng }
  }

  // ── 6. ISO 6709 short  +48.8566+002.3522/ ────────────────────────────────
  const iso = q.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)\/?$/)
  if (iso) {
    const lat = parseFloat(iso[1])
    const lng = parseFloat(iso[2])
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng }
  }

  return null
}

interface HistoryItem {
  id: string
  display_name: string
  lat: number
  lng: number
  result_type: string
}

const BASE = import.meta.env.DEV ? '/strava-api' : ''
const API = `${BASE}/api/search-history`

export function MapSearch() {
  const user = useAuthStore(s => s.user)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchHistory = useCallback(async () => {
    if (!useAuthStore.getState().user) return
    try {
      const res = await fetch(API, { headers: authHeader() })
      if (res.ok) setHistory(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchHistory() }, [fetchHistory, user])

  const flyTo = useCallback((lng: number, lat: number, zoom = 14) => {
    const map = getMapInstance()
    if (!map) return
    markerRef.current?.remove()
    const el = document.createElement('div')
    el.className = 'search-marker'
    el.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)'
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map)
    map.flyTo({ center: [lng, lat], zoom, duration: 1200 })
  }, [])

  const search = useCallback(async (q: string) => {
    const dms = parseCoords(q)
    if (dms) {
      setResults([{
        place_id: -1,
        display_name: `${dms.lat.toFixed(6)}, ${dms.lng.toFixed(6)}`,
        lat: String(dms.lat),
        lon: String(dms.lng),
        type: 'coordinates',
        importance: 1,
      }])
      setOpen(true)
      return
    }

    if (q.trim().length < 2) { setResults([]); setOpen(false); return }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`
      const res = await fetch(url, {
        signal: abortRef.current.signal,
        headers: { 'Accept-Language': 'es,en' },
      })
      const data: NominatimResult[] = await res.json()
      setResults(data)
      setOpen(data.length > 0)
    } catch {
      // aborted
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 350)
  }

  const handleSelect = async (r: NominatimResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setQuery(r.display_name)
    setOpen(false)
    flyTo(lng, lat)

    let display_name = r.display_name
    if (r.type === 'coordinates') {
      try {
        const rev = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'es,en' } }
        )
        const data = await rev.json()
        if (data?.display_name) {
          display_name = data.display_name
          setQuery(display_name)
        }
      } catch { /* keep coordinate string */ }
    }

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ display_name, lat, lng, result_type: r.type }),
    }).then(() => fetchHistory()).catch(() => {})
  }

  const handleSelectHistory = (h: HistoryItem) => {
    setQuery(h.display_name)
    setOpen(false)
    flyTo(h.lng, h.lat)
  }

  const handleDeleteHistory = (id: string) => {
    fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeader() })
      .then(() => setHistory(prev => prev.filter(h => h.id !== id)))
      .catch(() => {})
  }

  const handleClearHistory = () => {
    fetch(API, { method: 'DELETE', headers: authHeader() })
      .then(() => { setHistory([]); setOpen(false) })
      .catch(() => {})
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    if (e.key === 'Enter' && results.length > 0) handleSelect(results[0])
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
    markerRef.current?.remove()
    markerRef.current = null
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-3"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="relative flex items-center">
        <div className="absolute left-3 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(results.length > 0 || history.length > 0)}
          placeholder="Buscar ciudad, lugar, país o coordenadas…"
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg shadow-lg border-2 border-black bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-gray-400"
        />
        {loading && (
          <div className="absolute right-3 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
        {!loading && query && (
          <button onClick={handleClear} className="absolute right-3 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (results.length > 0 || (!query && history.length > 0)) && (
        <ul className="mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden text-sm">
          {!query && history.length > 0 && (
            <li className="px-3 pt-2 pb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Búsquedas recientes</span>
              <button
                onMouseDown={handleClearHistory}
                className="text-xs text-gray-400 hover:text-red-500"
              >Borrar todo</button>
            </li>
          )}
          {!query
            ? history.map((h) => (
              <li
                key={h.id}
                onMouseDown={() => handleSelectHistory(h)}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-start gap-2 border-b border-gray-100 last:border-0"
              >
                <span className="mt-0.5 shrink-0 text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <span className="text-gray-700 leading-snug flex-1">{h.display_name}</span>
                <button
                  onMouseDown={(e) => { e.stopPropagation(); handleDeleteHistory(h.id) }}
                  className="shrink-0 text-gray-300 hover:text-red-400 ml-1"
                  title="Eliminar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))
            : results.map((r) => (
              <li
                key={r.place_id}
                onMouseDown={() => handleSelect(r)}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50 flex items-start gap-2 border-b border-gray-100 last:border-0"
              >
                <span className="mt-0.5 shrink-0 text-blue-400">
                  {r.type === 'coordinates' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  )}
                </span>
                <span className="text-gray-700 leading-snug flex-1">{r.display_name}</span>
              </li>
            ))
          }
        </ul>
      )}
    </div>
  )
}
