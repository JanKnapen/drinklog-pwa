import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { CaffeineEntry, EntrySummaryItem } from '../types'
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

export function useCreateCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation({
    // See useCreateEntry — TanStack Query v5 defaults to networkMode 'online', which
    // pauses the mutationFn when offline and prevents the request from reaching our queue.
    networkMode: 'always',
    mutationFn: (data: {
      template_id?: string
      custom_name?: string
      mg: number
      timestamp: string
      fraction?: number
    }) => {
      // Idempotency key — see useCreateEntry for rationale.
      const payload = { ...data, request_id: crypto.randomUUID() }
      return apiFetch<CaffeineEntry>('/api/caffeine-entries', { method: 'POST', body: JSON.stringify(payload) })
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
