import { useToastStore } from '../store/toastStore'

const KIND_STYLES = {
  error: 'border-red-500/40 text-red-200',
  success: 'border-green-500/40 text-green-200',
  info: 'border-white/15 text-gray-200',
} as const

export function Toasts() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[calc(100vw-2rem)] w-80" aria-live="polite">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-xl border bg-gray-900/95 backdrop-blur px-3 py-2 text-xs shadow-2xl ${KIND_STYLES[t.kind]}`}
        >
          <p className="flex-1 leading-relaxed">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="text-gray-500 hover:text-white" aria-label="Cerrar aviso">×</button>
        </div>
      ))}
    </div>
  )
}
