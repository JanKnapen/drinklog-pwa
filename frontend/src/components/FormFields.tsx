import { standardUnits } from '../utils'
import { useAppConfig } from '../api/config'

export const inputCls = 'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-base text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
export const primaryBtn = 'w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</label>
      {children}
    </div>
  )
}

export function UnitPreview({ ml, abv }: { ml: string; abv: string }) {
  const config = useAppConfig()
  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  if (isNaN(mlNum) || isNaN(abvNum)) return null
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
      Standard units: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{standardUnits(mlNum, abvNum, config.alcohol_unit_divisor).toFixed(1)}</span>
    </p>
  )
}
