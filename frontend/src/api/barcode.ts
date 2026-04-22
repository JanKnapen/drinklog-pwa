import { apiFetch } from './client'

export interface BarcodeResult {
  source: 'local' | 'off' | 'not_found'
  template_id: string | null
  name: string | null
  ml: number | null
  abv: number | null
  mg: number | null
}

export function lookupBarcode(code: string, module: 'alcohol' | 'caffeine'): Promise<BarcodeResult> {
  return apiFetch<BarcodeResult>(`/api/barcode/${encodeURIComponent(code)}?module=${module}`)
}
