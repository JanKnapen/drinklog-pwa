import { useEffect } from 'react'

interface Props {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export default function Toast({ message, onDismiss, durationMs = 2000 }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [message, durationMs, onDismiss])

  return (
    <div
      className={`fixed bottom-safe-nav left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">
        {message}
      </div>
    </div>
  )
}
