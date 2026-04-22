import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { CaffeineTemplate } from '../types'

export const CAFFEINE_TEMPLATES_KEY = ['caffeine-templates'] as const

export function useCaffeineTemplates() {
  return useQuery({
    queryKey: CAFFEINE_TEMPLATES_KEY,
    queryFn: () => apiFetch<CaffeineTemplate[]>('/api/caffeine-templates'),
  })
}

export function useCreateCaffeineTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; default_mg: number; barcode?: string }) =>
      apiFetch<CaffeineTemplate>('/api/caffeine-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAFFEINE_TEMPLATES_KEY }),
  })
}

export function useUpdateCaffeineTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; name?: string; default_mg?: number; usage_count?: number; barcode?: string }) =>
      apiFetch<CaffeineTemplate>(`/api/caffeine-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAFFEINE_TEMPLATES_KEY }),
  })
}

export function useDeleteCaffeineTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/caffeine-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAFFEINE_TEMPLATES_KEY }),
  })
}
