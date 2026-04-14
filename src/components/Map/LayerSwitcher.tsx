import { useState } from 'react'
import { useMapStore, type BaseLayer } from '../../store/mapStore'
import { useIsMobile } from '../../hooks/useIsMobile'

const LAYERS: { id: BaseLayer; label: string; icon: string }[] = [
  { id: 'liberty', label: 'Mapa', icon: '🗺️' },
  { id: 'topo', label: 'Topo', icon: '🏔️' },
  { id: 'satellite', label: 'Satelite', icon: '🛰️' },
  { id: 'bright', label: 'Claro', icon: '☀️' },
]

export function LayerSwitcher() {
  const { baseLayer, setBaseLayer } = useMapStore()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  if (isMobile) {
    const active = LAYERS.find(l => l.id === baseLayer)!
    return (
      <div className="absolute top-16 left-4 z-10 flex flex-col items-start gap-1">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-10 h-10 rounded-xl bg-gray-900/95 border border-white/10 shadow-lg flex items-center justify-center text-base backdrop-blur"
          aria-label="Capas del mapa"
        >
          {active.icon}
        </button>
        {open && (
          <div className="bg-gray-900/95 backdrop-blur rounded-xl p-1 flex flex-col gap-1 shadow-lg border border-white/10">
            {LAYERS.map(l => (
              <button
                key={l.id}
                onClick={() => { setBaseLayer(l.id); setOpen(false) }}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                  baseLayer === l.id
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <span>{l.icon}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="absolute top-4 left-4 z-10">
      <div className="bg-gray-900/90 backdrop-blur rounded-xl p-1 flex flex-col gap-1 shadow-lg border border-white/10">
        {LAYERS.map(l => (
          <button
            key={l.id}
            onClick={() => setBaseLayer(l.id)}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
              baseLayer === l.id
                ? 'bg-orange-500 text-white'
                : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            <span>{l.icon}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
