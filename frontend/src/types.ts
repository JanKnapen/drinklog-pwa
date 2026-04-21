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

export interface CaffeineTemplate {
  id: string
  name: string
  default_mg: number
  usage_count: number
  entry_count: number
  confirmed_entry_count: number
}

export interface CaffeineEntry {
  id: string
  template_id: string | null
  template: CaffeineTemplate | null
  custom_name: string | null
  mg: number
  timestamp: string
  is_marked: boolean
  caffeine_units: number
}

export interface TrackerTemplate {
  id: string
  name: string
  usage_count: number
  entryCount: number
  confirmedEntryCount: number
  displayInfo: string
}

export interface TrackerEntry {
  id: string
  templateId: string | null
  customName: string | null
  name: string | null
  timestamp: string
  isMarked: boolean
  value: number
  displayInfo: string
}
