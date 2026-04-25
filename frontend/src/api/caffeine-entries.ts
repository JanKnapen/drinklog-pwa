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

export function useCaffeineSummary(period: 'week' | 'month' | 'year' | 'all') {
  return useQuery({
    queryKey: [...CAFFEINE_ENTRIES_SUMMARY_KEY, period] as const,
    queryFn: () => apiFetch<EntrySummaryItem[]>(`/api/caffeine-entries/summary?period=${period}`),
    staleTime: period === 'year' || period === 'all' ? Infinity : undefined,
    placeholderData: keepPreviousData,
  })
}

export function useCreateCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      template_id?: string
      custom_name?: string
      mg: number
      timestamp: string
    }) => apiFetch<CaffeineEntry>('/api/caffeine-entries', { method: 'POST', body: JSON.stringify(data) }),
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
