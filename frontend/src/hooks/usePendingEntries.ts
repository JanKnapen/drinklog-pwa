import { useEffect, useMemo, useState } from 'react'
import { listMutations, queueEvents, type PendingMutation } from '../api/offline-queue'
import type { DrinkEntry, DrinkTemplate, CaffeineEntry, CaffeineTemplate } from '../types'

export const PENDING_ID_PREFIX = 'pending-'

export function isPendingId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX)
}

function usePendingMutations(): PendingMutation[] {
  const [pending, setPending] = useState<PendingMutation[]>([])
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      listMutations()
        .then(m => { if (!cancelled) setPending(m) })
        .catch(() => {})
    }
    refresh()
    queueEvents.addEventListener('change', refresh)
    return () => {
      cancelled = true
      queueEvents.removeEventListener('change', refresh)
    }
  }, [])
  return pending
}

interface AlcoholBody {
  template_id?: string
  custom_name?: string
  ml: number
  abv: number
  timestamp: string
  fraction?: number
}

interface CaffeineBody {
  template_id?: string
  custom_name?: string
  mg: number
  timestamp: string
  fraction?: number
}

export function usePendingAlcoholEntries(templates: DrinkTemplate[]): DrinkEntry[] {
  const pending = usePendingMutations()
  return useMemo(() => {
    const result: DrinkEntry[] = []
    for (const m of pending) {
      if (m.method !== 'POST' || m.url !== '/api/alcohol-entries') continue
      let body: AlcoholBody
      try {
        body = JSON.parse(m.body) as AlcoholBody
      } catch {
        continue
      }
      const template = body.template_id ? templates.find(t => t.id === body.template_id) ?? null : null
      const fraction = body.fraction ?? 1
      result.push({
        id: `${PENDING_ID_PREFIX}${m.id}`,
        template_id: body.template_id ?? null,
        template,
        custom_name: body.custom_name ?? null,
        ml: body.ml,
        abv: body.abv,
        timestamp: body.timestamp,
        is_marked: false,
        standard_units: (body.ml * body.abv / 100) / 15 * fraction,
        fraction: body.fraction ?? null,
      })
    }
    return result
  }, [pending, templates])
}

export function usePendingCaffeineEntries(templates: CaffeineTemplate[]): CaffeineEntry[] {
  const pending = usePendingMutations()
  return useMemo(() => {
    const result: CaffeineEntry[] = []
    for (const m of pending) {
      if (m.method !== 'POST' || m.url !== '/api/caffeine-entries') continue
      let body: CaffeineBody
      try {
        body = JSON.parse(m.body) as CaffeineBody
      } catch {
        continue
      }
      const template = body.template_id ? templates.find(t => t.id === body.template_id) ?? null : null
      const fraction = body.fraction ?? 1
      result.push({
        id: `${PENDING_ID_PREFIX}${m.id}`,
        template_id: body.template_id ?? null,
        template,
        custom_name: body.custom_name ?? null,
        mg: body.mg,
        timestamp: body.timestamp,
        is_marked: false,
        caffeine_units: (body.mg / 80) * fraction,
        fraction: body.fraction ?? null,
      })
    }
    return result
  }, [pending, templates])
}
