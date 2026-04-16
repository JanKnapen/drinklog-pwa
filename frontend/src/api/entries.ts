import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { DrinkEntry } from '../types'
import { TEMPLATES_KEY } from './templates'

export const ENTRIES_KEY = ['entries'] as const

export function useEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: () => apiFetch<DrinkEntry[]>('/api/entries'),
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
    },
  })
}
