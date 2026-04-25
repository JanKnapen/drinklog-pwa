import { apiFetch } from './client'

export interface BarcodeResult {
  source: 'local' | 'off' | 'ah' | 'not_found'
  module: 'alcohol' | 'caffeine' | null
  template_id: string | null
  name: string | null
  ml: number | null
  abv: number | null
  mg: number | null
  latency_ms: number | null
  strategy_used: number | null
  actual_source: string | null
}

export function lookupBarcode(
  code: string,
  module: 'alcohol' | 'caffeine',
  strategy: 1 | 2 | 3 = 1,
): Promise<BarcodeResult> {
  return apiFetch<BarcodeResult>(
    `/api/barcode/${encodeURIComponent(code)}?module=${module}&strategy=${strategy}`,
  )
}
