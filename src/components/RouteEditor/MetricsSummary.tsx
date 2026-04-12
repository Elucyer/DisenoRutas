import { useState, useRef } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { snapRouteToRoad } from '../../services/routingService'
import { calculateMetrics } from '../../utils/routeMetrics'
import type { Route } from '../../types/route'
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, ACTIVITY_LABELS, formatTime } from '../../utils/routeMetrics'

const ROUTE_COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ef4444','#06b6d4','#eab308','#ec4899','#14b8a6','#f59e0b']

function formatPace(minutes: number, distanceKm: number): string {
  const paceMinKm = minutes / distanceKm
  const m = Math.floor(paceMinKm)
  const s = Math.round((paceMinKm - m) * 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

interface Props {
  route: Route
}

export function MetricsSummary({ route }: Props) {
  const m = route.metrics
  const { snappingRouteId, snappingProgress, setSnappingRoute, saveRoute } = useRouteStore()
  const isSnapping = snappingRouteId === route.id
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(route.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const commitName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== route.name) saveRoute({ ...route, name: trimmed })
    else setNameValue(route.name)
    setEditingName(false)
  }

  const pickColor = (color: string) => {
    saveRoute({ ...route, color })
    setShowColorPicker(false)
  }

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || route.tags.includes(tag)) { setTagInput(''); return }
    saveRoute({ ...route, tags: [...route.tags, tag] })
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    saveRoute({ ...route, tags: route.tags.filter(t => t !== tag) })
  }

  async function handleSnapRoute() {
    if (isSnapping) return
    setSnappingRoute(route.id, 0)
    try {
      const snapped = await snapRouteToRoad(
        route.coordinates,
        route.activityType,
        (pct) => setSnappingRoute(route.id, pct)
      )
      const updated: Route = {
        ...route,
        coordinates: snapped,
        metrics: calculateMetrics(snapped, route.activityType),
      }
      saveRoute(updated)
    } catch (e) {
      console.error('Snap route failed', e)
    } finally {
      setSnappingRoute(null)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        {/* Color dot — click to change */}
        <div className="relative mt-1 flex-shrink-0">
          <button
            onClick={() => setShowColorPicker(v => !v)}
            className="w-4 h-4 rounded-full border-2 border-white/20 hover:border-white/60 transition-all mt-0.5"
            style={{ backgroundColor: route.color }}
            title="Cambiar color"
          />
          {showColorPicker && (
            <div className="absolute left-0 top-6 z-20 bg-gray-900 border border-white/10 rounded-xl p-2 shadow-xl grid grid-cols-5 gap-1.5">
              {ROUTE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => pickColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c, borderColor: c === route.color ? '#fff' : 'transparent' }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameValue(route.name); setEditingName(false) } }}
              className="w-full bg-gray-800 border border-orange-500/50 rounded px-2 py-0.5 text-white text-sm font-semibold outline-none"
              autoFocus
            />
          ) : (
            <button
              onClick={() => { setEditingName(true); setNameValue(route.name) }}
              className="text-white font-semibold text-sm leading-tight hover:text-orange-400 transition-colors text-left w-full truncate flex items-center gap-1 group"
              title="Editar nombre"
            >
              {route.name}
              <span className="text-gray-600 opacity-0 group-hover:opacity-100 text-[10px] transition-opacity">✏️</span>
            </button>
          )}
          <p className="text-gray-500 text-xs">{ACTIVITY_LABELS[route.activityType]}</p>
          {route.createdAt && (
            <p className="text-gray-600 text-[10px]">
              {new Date(route.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {m && (
          <span
            className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: DIFFICULTY_COLORS[m.difficulty] + '30', color: DIFFICULTY_COLORS[m.difficulty] }}
          >
            {DIFFICULTY_LABELS[m.difficulty]}
          </span>
        )}
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon="📏" label="Distancia" value={`${m.distance} km`} />
          <Stat icon="⏱️" label={route.description?.startsWith('strava:') ? 'Tiempo real' : 'Tiempo est.'} value={formatTime(m.estimatedTime)} />
          <Stat icon="⬆️" label="Desnivel +" value={`${m.elevationGain} m`} />
          <Stat icon="⬇️" label="Desnivel -" value={`${m.elevationLoss} m`} />
          <Stat icon="🏔️" label="Máx. altitud" value={`${m.elevationMax} m`} />
          <Stat icon="🔥" label="Kcal" value={`~${m.kcal}`} />
          {m.distance > 0 && m.estimatedTime > 0 && (
            route.activityType === 'cycling'
              ? <Stat icon="⚡" label="Velocidad" value={`${(m.distance / (m.estimatedTime / 60)).toFixed(1)} km/h`} />
              : <Stat icon="⚡" label="Ritmo" value={formatPace(m.estimatedTime, m.distance)} />
          )}
        </div>
      )}

      {/* Tags */}
      <div>
        <p className="text-gray-600 text-[9px] uppercase tracking-wider mb-1.5">Etiquetas</p>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {route.tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800 border border-white/10 text-gray-400 text-[10px]">
              #{tag}
              <button onClick={() => removeTag(tag)} className="text-gray-600 hover:text-red-400 transition-colors leading-none">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            ref={tagInputRef}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTag(tagInput); if (e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
            placeholder="Añadir etiqueta..."
            className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-orange-500/50 transition-colors"
          />
          <button
            onClick={() => addTag(tagInput)}
            disabled={!tagInput.trim()}
            className="px-2 py-1 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all"
          >+</button>
        </div>
      </div>

      {/* Share route */}
      <button
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}?route=${route.id}`
          navigator.clipboard.writeText(url).then(() => {
            const btn = document.getElementById(`share-btn-${route.id}`)
            if (btn) { btn.textContent = '✓ Link copiado'; setTimeout(() => { btn.textContent = '🔗 Compartir ruta' }, 2000) }
          })
        }}
        id={`share-btn-${route.id}`}
        className="w-full py-2 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
      >
        🔗 Compartir ruta
      </button>

      {/* Snap to road button */}
      <button
        onClick={handleSnapRoute}
        disabled={isSnapping}
        className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border ${
          isSnapping
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 cursor-wait'
            : 'border-white/10 text-gray-400 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10'
        }`}
      >
        {isSnapping ? (
          <>
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span>Ajustando a vía... {snappingProgress}%</span>
          </>
        ) : (
          <>
            <span>🛣️</span>
            <span>Ajustar ruta a vía</span>
          </>
        )}
      </button>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className="text-gray-500 text-[10px] flex items-center gap-1">
        <span>{icon}</span>{label}
      </p>
      <p className="text-white text-sm font-semibold">{value}</p>
    </div>
  )
}
