import { useQuery, useMutation, useQueryClient, keepPreviousData, type QueryKey } from '@tanstack/react-query'
import { apiFetch, OfflineQueuedError } from './client'
import type { DrinkEntry, DrinkTemplate, EntrySummaryItem } from '../types'
import { TEMPLATES_KEY } from './templates'

export const ENTRIES_KEY = ['entries'] as const
export const ENTRIES_SUMMARY_KEY = ['entries', 'summary'] as const

function buildEntriesUrl(limit = 100, offset = 0, confirmedOnly = false) {
  const params = new URLSearchParams()
  if (limit !== 100) params.set('limit', String(limit))
  if (offset !== 0) params.set('offset', String(offset))
  if (confirmedOnly) params.set('confirmed_only', 'true')
  const qs = params.toString()
  return qs ? `/api/alcohol-entries?${qs}` : '/api/alcohol-entries'
}

export function useEntries(params?: { limit?: number; offset?: number; confirmedOnly?: boolean }) {
  const limit = params?.limit ?? 100
  const offset = params?.offset ?? 0
  const confirmedOnly = params?.confirmedOnly ?? false
  return useQuery({
    queryKey: ['entries', { limit, offset, confirmedOnly }] as const,
    queryFn: () => apiFetch<DrinkEntry[]>(buildEntriesUrl(limit, offset, confirmedOnly)),
  })
}

export function useEntrySummary(params: { start: string; end: string } | null) {
  return useQuery({
    queryKey: [...ENTRIES_SUMMARY_KEY, params?.start ?? null, params?.end ?? null] as const,
    queryFn: () => apiFetch<EntrySummaryItem[]>(
      `/api/alcohol-entries/summary?start=${params!.start}&end=${params!.end}`
    ),
    enabled: params !== null,
    placeholderData: keepPreviousData,
  })
}

export function useEntryRange() {
  return useQuery({
    queryKey: [...ENTRIES_SUMMARY_KEY, 'range'] as const,
    queryFn: () => apiFetch<{ first_date: string | null; last_date: string | null }>(
      '/api/alcohol-entries/summary/range'
    ),
  })
}

type CreateEntryPayload = {
  template_id?: string
  custom_name?: string
  ml: number
  abv: number
  timestamp: string
  fraction?: number
}

interface OptimisticContext {
  snapshots: Array<[QueryKey, DrinkEntry[] | undefined]>
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation<DrinkEntry, Error, CreateEntryPayload, OptimisticContext>({
    mutationFn: (data) =>
      apiFetch<DrinkEntry>('/api/alcohol-entries', { method: 'POST', body: JSON.stringify(data) }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ENTRIES_KEY })
      const fraction = data.fraction ?? 1
      const template = data.template_id
        ? (qc.getQueryData<DrinkTemplate[]>(TEMPLATES_KEY) ?? []).find(t => t.id === data.template_id) ?? null
        : null
      const optimistic: DrinkEntry = {
        id: `optimistic-${crypto.randomUUID()}`,
        template_id: data.template_id ?? null,
        template,
        custom_name: data.custom_name ?? null,
        ml: data.ml,
        abv: data.abv,
        timestamp: data.timestamp,
        is_marked: false,
        standard_units: (data.ml * data.abv / 100) / 15 * fraction,
        fraction: data.fraction ?? null,
      }
      const snapshots: Array<[QueryKey, DrinkEntry[] | undefined]> = []
      // Predicate filters out summary queries (which share the 'entries' prefix
      // but have 'summary' as the second key element and a different value shape).
      const matches = qc.getQueriesData<DrinkEntry[]>({
        predicate: (q) => {
          const k = q.queryKey
          return Array.isArray(k) && k[0] === 'entries' && typeof k[1] === 'object' && k[1] !== null
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
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; custom_name?: string; ml?: number; abv?: number; timestamp?: string }) =>
      apiFetch<DrinkEntry>(`/api/alcohol-entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/alcohol-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: ENTRIES_SUMMARY_KEY })
    },
  })
}

export function useConfirmAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cutoff: string) =>
      apiFetch<{ confirmed: number }>('/api/alcohol-entries/confirm-all', {
        method: 'POST',
        body: JSON.stringify({ cutoff }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      qc.invalidateQueries({ queryKey: ENTRIES_SUMMARY_KEY })
    },
  })
}
