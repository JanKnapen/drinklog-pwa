import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { CaffeineEntry } from '../types'
import { CAFFEINE_TEMPLATES_KEY } from './caffeine-templates'

export const CAFFEINE_ENTRIES_KEY = ['caffeine-entries'] as const

export function useCaffeineEntries() {
  return useQuery({
    queryKey: CAFFEINE_ENTRIES_KEY,
    queryFn: () => apiFetch<CaffeineEntry[]>('/api/caffeine-entries'),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY }),
  })
}

export function useDeleteCaffeineEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/caffeine-entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAFFEINE_ENTRIES_KEY }),
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
    },
  })
}
