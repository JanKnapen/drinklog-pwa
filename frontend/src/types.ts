export interface DrinkTemplate {
  id: string
  name: string
  default_ml: number
  default_abv: number
  usage_count: number
  entry_count: number
  confirmed_entry_count: number
}

export interface DrinkEntry {
  id: string
  template_id: string | null
  template: DrinkTemplate | null
  custom_name: string | null
  ml: number
  abv: number
  timestamp: string
  is_marked: boolean
  standard_units: number
}

export type FilterPeriod = 'today' | 'week' | 'month' | '3m' | 'year' | 'all'
