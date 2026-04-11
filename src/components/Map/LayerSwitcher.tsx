import { useMapStore, type BaseLayer } from '../../store/mapStore'

const LAYERS: { id: BaseLayer; label: string; icon: string }[] = [
  { id: 'liberty', label: 'Mapa', icon: '🗺️' },
  { id: 'topo', label: 'Topo', icon: '🏔️' },
  { id: 'satellite', label: 'Satelite', icon: '🛰️' },
  { id: 'bright', label: 'Claro', icon: '☀️' },
]

export function LayerSwitcher() {
  const { baseLayer, setBaseLayer } = useMapStore()

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
