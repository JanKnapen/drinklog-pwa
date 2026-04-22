import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { DrinkTemplate } from '../types'

export const TEMPLATES_KEY = ['templates'] as const

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => apiFetch<DrinkTemplate[]>('/api/templates'),
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; default_ml: number; default_abv: number; barcode?: string }) =>
      apiFetch<DrinkTemplate>('/api/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      name?: string
      default_ml?: number
      default_abv?: number
      usage_count?: number
      barcode?: string
    }) =>
      apiFetch<DrinkTemplate>(`/api/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}
