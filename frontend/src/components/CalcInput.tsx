import { useRef, useState, useEffect } from 'react'
import { inputCls } from './FormFields'
import { CalculatorKeyboard } from './CalculatorKeyboard'

// ─── Pure logic (exported for tests) ────────────────────────────────────────

const OPERATORS_RE = /[+−×÷]/

function formatResult(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export function evaluateExpression(expr: string): number | null {
  if (!expr.trim()) return null
  const sanitised = expr
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[^0-9.\+\-\*\/]/g, '')
  if (!sanitised.trim()) return null
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + sanitised + ')')() as unknown
    if (typeof result !== 'number' || !isFinite(result) || isNaN(result)) return null
    return result
  } catch {
    return null
  }
}

export function handleCalcKey(
  key: string,
  expr: string,
): { expr: string; commit: string | null } {
  if (key === '⌫') {
    return { expr: expr.slice(0, -1), commit: null }
  }

  if (key === '=') {
    if (!OPERATORS_RE.test(expr)) {
      // Plain number — commit as-is
      const n = parseFloat(expr)
      if (isNaN(n)) return { expr, commit: null }
      return { expr, commit: expr }
    }
    const result = evaluateExpression(expr)
    if (result === null) return { expr, commit: null }
    const str = formatResult(result)
    return { expr: str, commit: str }
  }

  if (key === '.') {
    // Find last operator index to isolate current number segment
    const chars = [...expr]
    const lastOpIdx = chars.reduce(
      (max, char, i) => (OPERATORS_RE.test(char) ? i : max),
      -1,
    )
    const segment = expr.slice(lastOpIdx + 1)
    if (segment.includes('.')) return { expr, commit: null }
    return { expr: expr + '.', commit: null }
  }

  return { expr: expr + key, commit: null }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export function CalcInput({ value, onChange, className, placeholder, disabled }: Props) {
  const isMobile = useRef(
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  )
  const [expr, setExpr] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [isError, setIsError] = useState(false)

  // Keep expr in sync when value changes externally (e.g. prefill from barcode)
  useEffect(() => {
    if (!isOpen) setExpr(value)
  }, [value, isOpen])

  function handleOpen() {
    if (disabled) return
    setExpr(value)
    setIsError(false)
    setIsOpen(true)
  }

  function handleKey(key: string) {
    const { expr: nextExpr, commit } = handleCalcKey(key, expr)
    setExpr(nextExpr)

    if (commit !== null) {
      onChange(commit)
      setIsOpen(false)
      setIsError(false)
    } else if (key === '=') {
      // = was pressed but evaluation failed
      setIsError(true)
    } else {
      setIsError(false)
    }
  }

  function handleDismiss() {
    if (expr) {
      if (OPERATORS_RE.test(expr)) {
        const result = evaluateExpression(expr)
        if (result !== null) onChange(formatResult(result))
        // If invalid, revert — don't call onChange
      } else {
        const n = parseFloat(expr)
        if (!isNaN(n)) onChange(expr)
      }
    }
    setIsOpen(false)
    setIsError(false)
  }

  if (!isMobile.current) {
    return (
      <input
        className={className}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <>
      {/* Display div — replaces the <input> visually */}
      <div
        className={`${className ?? inputCls} flex items-center cursor-pointer ${
          isOpen ? 'ring-2 ring-blue-500 outline-none' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onPointerDown={handleOpen}
      >
        {value ? (
          <span>
            {value}
            {isOpen && <span className="ml-0.5 text-blue-500">|</span>}
          </span>
        ) : (
          <span className="text-neutral-400 dark:text-neutral-500">{placeholder}</span>
        )}
      </div>

      {/* Backdrop — catches outside taps */}
      {isOpen && (
        <div className="fixed inset-0 z-[50]" onPointerDown={handleDismiss} />
      )}

      {/* Calculator keyboard — portal-rendered above backdrop */}
      {isOpen && (
        <CalculatorKeyboard expression={expr} isError={isError} onKey={handleKey} />
      )}
    </>
  )
}
