import { useAuthModalStore } from '../../store/authModalStore'

const API = import.meta.env.DEV ? '/strava-api' : ''

export function AuthModal() {
  const hide = useAuthModalStore(s => s.hide)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={hide}>
      <div
        className="bg-gray-950 border border-white/10 rounded-2xl w-full max-w-xs mx-4 shadow-2xl p-6 text-center"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-3xl mb-3">🗺️</p>
        <h2 className="text-white font-bold text-base mb-1">Necesitas una cuenta</h2>
        <p className="text-gray-500 text-xs mb-5">Conéctate con Strava para guardar y cargar rutas en RutasMap</p>

        <a
          href={`${API}/api/auth/strava`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 transition-colors text-white font-medium text-sm"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.024 4.116zm-7.698-4.348l2.104 4.326L12 24l-1.195-2.4-3.116-3.948z"/>
          </svg>
          Conectar con Strava
        </a>

        <button onClick={hide} className="mt-3 text-gray-600 hover:text-gray-400 text-xs transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}
