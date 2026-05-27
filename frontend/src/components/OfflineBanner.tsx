import { useEffect, useState } from 'react'
import { countMutations, queueEvents } from '../api/offline-queue'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      countMutations().then(n => { if (!cancelled) setPending(n) })
    }
    refresh()
    queueEvents.addEventListener('change', refresh)
    return () => {
      cancelled = true
      queueEvents.removeEventListener('change', refresh)
    }
  }, [])

  if (isOnline && pending === 0) return null

  const noun = pending === 1 ? 'entry' : 'entries'
  const msg = !isOnline
    ? pending > 0 ? `Offline — ${pending} ${noun} pending sync` : 'Offline'
    : `Syncing ${pending} ${noun}…`

  return (
    <div className="flex-shrink-0 px-4 py-1.5 text-center text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
      {msg}
    </div>
  )
}
