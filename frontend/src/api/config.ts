import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'

interface AppConfig {
  alcohol_unit_divisor: number
  caffeine_unit_divisor: number
}

const CONFIG_KEY = ['config'] as const

const DEFAULT_CONFIG: AppConfig = {
  alcohol_unit_divisor: 15,
  caffeine_unit_divisor: 80,
}

export function useAppConfig() {
  const { data } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => apiFetch<AppConfig>('/api/config'),
    staleTime: Infinity,
  })
  return data ?? DEFAULT_CONFIG
}
