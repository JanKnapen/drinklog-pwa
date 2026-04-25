import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { DrinkEntry, EntrySummaryItem } from '../types'
import { TEMPLATES_KEY } from './templates'

export const ENTRIES_KEY = ['entries'] as const
export const ENTRIES_SUMMARY_KEY = ['entries', 'summary'] as const

function buildEntriesUrl(limit = 100, offset = 0, confirmedOnly = false) {
  const params = new URLSearchParams()
  if (limit !== 100) params.set('limit', String(limit))
  if (offset !== 0) params.set('offset', String(offset))
  if (confirmedOnly) params.set('confirmed_only', 'true')
  const qs = params.toString()
  return qs ? `/api/entries?${qs}` : '/api/entries'
}

export function useEntries(params?: { limit?: number; offset?: number; confirmedOnly?: boolean }) {
  const limit = params?.limit
  const offset = params?.offset
  const confirmedOnly = params?.confirmedOnly
  return useQuery({
    queryKey: ['entries', { limit, offset, confirmedOnly }] as const,
    queryFn: () => apiFetch<DrinkEntry[]>(buildEntriesUrl(limit, offset, confirmedOnly)),
  })
}

export function useEntrySummary(period: 'week' | 'month' | 'year' | 'all') {
  return useQuery({
    queryKey: [...ENTRIES_SUMMARY_KEY, period] as const,
    queryFn: () => apiFetch<EntrySummaryItem[]>(`/api/entries/summary?period=${period}`),
    staleTime: period === 'year' || period === 'all' ? Infinity : undefined,
    placeholderData: keepPreviousData,
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      template_id?: string
      custom_name?: string
      ml: number
      abv: number
      timestamp: string
    }) => apiFetch<DrinkEntry>('/api/entries', { method: 'POST', body: JSON.stringify(data) }),
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
      apiFetch<DrinkEntry>(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useConfirmAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cutoff: string) =>
      apiFetch<{ confirmed: number }>('/api/entries/confirm-all', {
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
