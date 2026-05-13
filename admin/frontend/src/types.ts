export interface AdminUser {
  id: number;
  username: string;
  alcohol_entries: number;
  caffeine_entries: number;
}

export type Module = 'alcohol' | 'caffeine';

export interface TemplateOption {
  id: string;
  name: string;
}

export interface RawImportEntry {
  name: string;
  date?: string;
  timestamp?: string;
  count?: number;
}

export interface ImportSession {
  token: string;
  userId: number;
  username: string;
  module: Module;
  rawEntries: RawImportEntry[];
}

export interface DrinkMapping {
  drink_name: string;
  mode: 'existing' | 'new';
  template_id?: string;
  ml?: number;
  abv?: number;
  mg?: number;
}

export interface ImportRequest {
  module: Module;
  mappings: DrinkMapping[];
  entries: RawImportEntry[];
}
