import { useState, useMemo } from 'react'
import { useRouteStore } from '../../store/routeStore'
import { useMapStore } from '../../store/mapStore'
import { useIsMobile } from '../../hooks/useIsMobile'
import type { ActivityType } from '../../types/route'
import { ACTIVITY_LABELS, formatTime } from '../../utils/routeMetrics'
import { totalDistance } from '../../utils/geometry'

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  running: '🏃',
  cycling: '🚵',
  hiking: '🥾',
}

export function DrawingControls() {
  const { isDrawing, drawingCoords, drawingActivityType, startDrawing, cancelDrawing, finishDrawing, undoLastPoint } = useRouteStore()
  const { snapToRoad, toggleSnapToRoad, isSnapping, showRoutes, toggleShowRoutes } = useMapStore()
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [routeName, setRouteName] = useState('')
  const [selectedActivity, setSelectedActivity] = useState<ActivityType>('hiking')

  const isMobile = useIsMobile()
  const liveDistance = useMemo(() => totalDistance(drawingCoords), [drawingCoords])

  const liveTime = useMemo(() => {
    if (liveDistance === 0) return null
    const speeds: Record<ActivityType, number> = { running: 8, cycling: 20, hiking: 4 }
    return Math.round((liveDistance / speeds[drawingActivityType]) * 60)
  }, [liveDistance, drawingActivityType])

  const handleFinish = () => {
    if (drawingCoords.length < 2) return
    setRouteName(`Ruta ${new Date().toLocaleDateString('es-ES')}`)
    setShowFinishModal(true)
  }

  const handleConfirmFinish = () => {
    const name = routeName.trim() || `Ruta ${new Date().toLocaleDateString('es-ES')}`
    finishDrawing(name)
    setShowFinishModal(false)
    setRouteName('')
  }

  if (!isDrawing) {
    if (isMobile) {
      return (
        <div className="absolute bottom-36 right-4 z-10 flex flex-col items-end gap-2">
          <button
            onClick={toggleShowRoutes}
            title={showRoutes ? 'Ocultar rutas' : 'Mostrar rutas'}
            className={`w-10 h-10 rounded-xl shadow-lg border flex items-center justify-center text-base backdrop-blur transition-all ${
              showRoutes
                ? 'bg-gray-900/95 border-white/10 text-gray-300'
                : 'bg-orange-500/20 border-orange-500/50 text-orange-400'
            }`}
          >
            {showRoutes ? '🙈' : '👁️'}
          </button>
          <div className="bg-gray-900/95 backdrop-blur rounded-xl p-1.5 flex flex-col gap-1 shadow-lg border border-white/10">
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map(type => (
              <button
                key={type}
                onClick={() => { setSelectedActivity(type); startDrawing(type) }}
                className="w-10 h-10 rounded-lg text-base flex items-center justify-center text-gray-300 hover:bg-white/10 transition-all"
                title={ACTIVITY_LABELS[type]}
              >
                {ACTIVITY_ICONS[type]}
              </button>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="absolute bottom-32 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={toggleShowRoutes}
          title={showRoutes ? 'Ocultar rutas' : 'Mostrar rutas'}
          className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 shadow-lg border transition-all backdrop-blur ${
            showRoutes
              ? 'bg-gray-900/90 border-white/10 text-gray-300 hover:text-white'
              : 'bg-orange-500/20 border-orange-500/50 text-orange-400'
          }`}
        >
          <span>{showRoutes ? '🙈' : '👁️'}</span>
          <span>{showRoutes ? 'Ocultar rutas' : 'Mostrar rutas'}</span>
        </button>
        <div className="bg-gray-900/90 backdrop-blur rounded-xl p-2 flex flex-col gap-1 shadow-lg border border-white/10">
          <p className="text-gray-400 text-xs px-2 pb-1">Dibujar ruta</p>
          {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map(type => (
            <button
              key={type}
              onClick={() => { setSelectedActivity(type); startDrawing(type) }}
              className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 text-gray-300 hover:bg-white/10 transition-all"
            >
              <span>{ACTIVITY_ICONS[type]}</span>
              <span>{ACTIVITY_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (isMobile && isDrawing) {
    return (
      <>
        {/* Drawing toolbar móvil — horizontal en la parte superior */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-gray-900/95 backdrop-blur rounded-xl p-2.5 shadow-lg border border-orange-500/50 flex flex-col gap-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-orange-400 text-xs font-semibold">
                <span>{ACTIVITY_ICONS[drawingActivityType]}</span>
                <span>Dibujando...</span>
              </div>
              <div className="flex gap-2 text-xs tabular-nums text-gray-300">
                <span className="text-gray-500">📏</span>
                <span className="font-semibold">
                  {liveDistance < 1
                    ? `${Math.round(liveDistance * 1000)} m`
                    : `${liveDistance.toFixed(2)} km`}
                </span>
                {liveTime != null && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500">⏱️</span>
                    <span>{formatTime(liveTime)}</span>
                  </>
                )}
              </div>
            </div>
            {/* Botones */}
            <div className="flex gap-2">
              <button
                onClick={toggleSnapToRoad}
                className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all border ${
                  snapToRoad
                    ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                    : 'border-white/10 text-gray-400'
                }`}
              >
                {isSnapping ? (
                  <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                ) : <span>🛣️</span>}
                <span>{snapToRoad ? 'Vía ON' : 'Vía OFF'}</span>
              </button>
              <button
                onClick={undoLastPoint}
                disabled={drawingCoords.length === 0}
                className="flex-1 py-2 rounded-lg text-xs text-gray-300 hover:bg-white/10 disabled:opacity-40 transition-all border border-white/10"
              >
                ↩ Deshacer
              </button>
              <button
                onClick={handleFinish}
                disabled={drawingCoords.length < 2}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white transition-all"
              >
                ✓ Guardar
              </button>
              <button
                onClick={cancelDrawing}
                className="py-2 px-3 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-white/5 transition-all border border-white/10"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Finish modal */}
        {showFinishModal && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm pb-8 px-4">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-5 w-full shadow-2xl">
              <h3 className="text-white font-semibold text-base mb-3">Guardar ruta</h3>
              <input
                type="text"
                value={routeName}
                onChange={e => setRouteName(e.target.value)}
                placeholder="Nombre de la ruta..."
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm mb-4 outline-none focus:border-orange-500"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleConfirmFinish()}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFinishModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 border border-white/10 hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmFinish}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {/* Drawing toolbar escritorio */}
      <div className="absolute bottom-32 right-4 z-10 flex flex-col gap-2">
        <div className="bg-gray-900/90 backdrop-blur rounded-xl p-3 shadow-lg border border-orange-500/50 flex flex-col gap-2 min-w-[160px]">
          <div className="flex items-center gap-2 text-orange-400 text-xs font-semibold">
            <span>{ACTIVITY_ICONS[drawingActivityType]}</span>
            <span>Dibujando...</span>
          </div>

          {/* Live stats */}
          <div className="bg-black/30 rounded-lg px-3 py-2 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">📏 Distancia</span>
              <span className="text-white text-xs font-semibold tabular-nums">
                {liveDistance < 1
                  ? `${Math.round(liveDistance * 1000)} m`
                  : `${liveDistance.toFixed(2)} km`}
              </span>
            </div>
            {liveTime != null && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-xs">⏱️ Est.</span>
                <span className="text-gray-300 text-xs tabular-nums">{formatTime(liveTime)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-xs">📍 Puntos</span>
              <span className="text-gray-400 text-xs tabular-nums">{drawingCoords.length}</span>
            </div>
          </div>
          {/* Snap to road toggle */}
          <button
            onClick={toggleSnapToRoad}
            className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border ${
              snapToRoad
                ? 'bg-blue-500/20 border-blue-500/60 text-blue-400'
                : 'border-white/10 text-gray-400 hover:bg-white/5'
            }`}
          >
            {isSnapping ? (
              <>
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span>Ajustando...</span>
              </>
            ) : (
              <>
                <span>🛣️</span>
                <span>Ajuste a vía: {snapToRoad ? 'ON' : 'OFF'}</span>
              </>
            )}
          </button>

          <div className="flex gap-2">
            <button
              onClick={undoLastPoint}
              disabled={drawingCoords.length === 0}
              className="flex-1 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-white/10 disabled:opacity-40 transition-all border border-white/10"
            >
              ↩ Deshacer
            </button>
          </div>
          <button
            onClick={handleFinish}
            disabled={drawingCoords.length < 2}
            className="py-2 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white transition-all"
          >
            ✓ Guardar ruta
          </button>
          <button
            onClick={cancelDrawing}
            className="py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-white/5 transition-all"
          >
            ✕ Cancelar
          </button>
        </div>
      </div>

      {/* Finish modal */}
      {showFinishModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-4">Guardar ruta</h3>
            <input
              type="text"
              value={routeName}
              onChange={e => setRouteName(e.target.value)}
              placeholder="Nombre de la ruta..."
              className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-4 outline-none focus:border-orange-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleConfirmFinish()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowFinishModal(false)}
                className="flex-1 py-2 rounded-lg text-sm text-gray-400 border border-white/10 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmFinish}
                className="flex-1 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
