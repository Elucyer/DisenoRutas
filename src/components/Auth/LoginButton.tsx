import { useAuthStore } from '../../store/authStore'
import { useAuthModalStore } from '../../store/authModalStore'

export function LoginButton() {
  const { user, logout } = useAuthStore()
  const show = useAuthModalStore(s => s.show)

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {user.pic && (
          <img src={user.pic} alt={user.name} className="w-6 h-6 rounded-full border border-white/20" />
        )}
        <span className="text-gray-300 text-xs truncate max-w-[80px]">{user.name.split(' ')[0]}</span>
        {user.isAdmin && (
          <span className="text-[9px] text-orange-400 border border-orange-500/30 rounded px-1 py-0.5">admin</span>
        )}
        <button
          onClick={logout}
          className="text-gray-600 hover:text-red-400 text-[10px] transition-colors"
          title="Cerrar sesión"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={show}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border border-white/20 text-gray-400 hover:text-white hover:border-white/40 transition-all"
    >
      Iniciar sesión
    </button>
  )
}
