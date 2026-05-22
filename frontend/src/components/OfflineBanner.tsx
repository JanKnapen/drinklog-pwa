import { useEffect, useState } from 'react'
import { countMutations, queueEvents } from '../api/offline-queue'
import { drainEvents, isDrainInProgress } from '../api/client'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

interface Props {
  onRetry?: () => void
}

export default function OfflineBanner({ onRetry }: Props) {
  const isOnline = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [draining, setDraining] = useState(isDrainInProgress())

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

  useEffect(() => {
    const refresh = () => setDraining(isDrainInProgress())
    drainEvents.addEventListener('change', refresh)
    return () => drainEvents.removeEventListener('change', refresh)
  }, [])

  if (isOnline && pending === 0) return null

  const noun = pending === 1 ? 'entry' : 'entries'
  let msg: string
  let canRetry = false

  if (!isOnline) {
    msg = pending > 0 ? `Offline — ${pending} ${noun} pending sync` : 'Offline'
  } else if (draining) {
    msg = `Syncing ${pending} ${noun}…`
  } else {
    msg = `Sync paused — ${pending} ${noun}. Tap to retry.`
    canRetry = !!onRetry
  }

  const baseCls = 'flex-shrink-0 px-4 py-1.5 text-center text-xs font-medium bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'

  if (canRetry) {
    return (
      <button onClick={onRetry} className={`${baseCls} w-full active:opacity-70 transition-opacity`}>
        {msg}
      </button>
    )
  }
  return <div className={baseCls}>{msg}</div>
}
