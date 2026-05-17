import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryKey } from '@tanstack/react-query'
import { apiFetch, OfflineQueuedError } from './client'
import type { CaffeineEntry, CaffeineTemplate, EntrySummaryItem } from '../types'
import { CAFFEINE_TEMPLATES_KEY } from './caffeine-templates'

export const CAFFEINE_ENTRIES_KEY = ['caffeine-entries'] as const
export const CAFFEINE_ENTRIES_SUMMARY_KEY = ['caffeine-entries', 'summary'] as const

function buildCaffeineEntriesUrl(limit = 100, offset = 0, confirmedOnly = false) {
  const params = new URLSearchParams()
  if (limit !== 100) params.set('limit', String(limit))
  if (offset !== 0) params.set('offset', String(offset))
  if (confirmedOnly) params.set('confirmed_only', 'true')
  const qs = params.toString()
  return qs ? `/api/caffeine-entries?${qs}` : '/api/caffeine-entries'
}

export function useCaffeineEntries(params?: { limit?: number; offset?: number; confirmedOnly?: boolean }) {
  const limit = params?.limit ?? 100
  const offset = params?.offset ?? 0
  const confirmedOnly = params?.confirmedOnly ?? false
  return useQuery({
    queryKey: ['caffeine-entries', { limit, offset, confirmedOnly }] as const,
    queryFn: () => apiFetch<CaffeineEntry[]>(buildCaffeineEntriesUrl(limit, offset, confirmedOnly)),
  })
}

export function useCaffeineSummary(params: { start: string; end: string } | null) {
  return useQuery({
    queryKey: [...CAFFEINE_ENTRIES_SUMMARY_KEY, params?.start ?? null, params?.end ?? null] as const,
    queryFn: () => apiFetch<EntrySummaryItem[]>(
      `/api/caffeine-entries/summary?start=${params!.start}&end=${params!.end}`
    ),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  })
}

export function useCaffeineRange() {
  return useQuery({
    queryKey: [...CAFFEINE_ENTRIES_SUMMARY_KEY, 'range'] as const,
    queryFn: () => apiFetch<{ first_date: string | null; last_date: string | null }>(
      '/api/caffeine-entries/summary/range'
    ),
  })
}

type CreateCaffeineEntryPayload = {
  template_id?: string
  custom_name?: string
  mg: number
  timestamp: string
  fraction?: number
}

interface OptimisticContext {
  snapshots: Array<[QueryKey, CaffeineEntry[] | undefined]>
}

export function useCreateCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation<CaffeineEntry, Error, CreateCaffeineEntryPayload, OptimisticContext>({
    mutationFn: (data) =>
      apiFetch<CaffeineEntry>('/api/caffeine-entries', { method: 'POST', body: JSON.stringify(data) }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: CAFFEINE_ENTRIES_KEY })
      const fraction = data.fraction ?? 1
      const template = data.template_id
        ? (qc.getQueryData<CaffeineTemplate[]>(CAFFEINE_TEMPLATES_KEY) ?? []).find(t => t.id === data.template_id) ?? null
        : null
      const optimistic: CaffeineEntry = {
        id: `optimistic-${crypto.randomUUID()}`,
        template_id: data.template_id ?? null,
        template,
        custom_name: data.custom_name ?? null,
        mg: data.mg,
        timestamp: data.timestamp,
        is_marked: false,
        caffeine_units: (data.mg / 80) * fraction,
        fraction: data.fraction ?? null,
      }
      const snapshots: Array<[QueryKey, CaffeineEntry[] | undefined]> = []
      // Predicate filters out summary queries (which share the 'caffeine-entries' prefix
      // but have 'summary' as the second key element and a different value shape).
      const matches = qc.getQueriesData<CaffeineEntry[]>({
        predicate: (q) => {
          const k = q.queryKey
          return Array.isArray(k) && k[0] === 'caffeine-entries' && typeof k[1] === 'object' && k[1] !== null
        },
      })
      for (const [key, prev] of matches) {
        const params = (key as readonly unknown[])[1] as { confirmedOnly?: boolean }
        if (params.confirmedOnly) continue
        snapshots.push([key, prev])
        if (Array.isArray(prev)) qc.setQueryData(key, [optimistic, ...prev])
      }
      return { snapshots }
    },
    onError: (err, _vars, ctx) => {
      if (err instanceof OfflineQueuedError) return
      ctx?.snapshots.forEach(([key, prev]) => qc.setQueryData(key, prev))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useUpdateCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; custom_name?: string; mg?: number; timestamp?: string }) =>
      apiFetch<CaffeineEntry>(`/api/caffeine-entries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useDeleteCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/caffeine-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useConfirmAllCaffeineEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cutoff: string) =>
      apiFetch<{ confirmed: number }>('/api/caffeine-entries/confirm-all', {
        method: 'POST',
        body: JSON.stringify({ cutoff }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_SUMMARY_KEY })
    },
  })
}
