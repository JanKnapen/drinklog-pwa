import { useRef, useState, useEffect } from 'react'
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
    .replace(/[^0-9.+\-*/]/g, '')
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

// Handles only operator toolbar keys — digits/backspace/decimal are native keyboard's job.
export function handleCalcKey(
  key: string,
  expr: string,
): { expr: string; commit: string | null } {
  if (key === '=') {
    const result = evaluateExpression(expr)
    if (result === null) return { expr, commit: null }
    const str = formatResult(result)
    return { expr: str, commit: str }
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
  const [bottom, setBottom] = useState(0)
  const lastCommitted = useRef(value)

  // Sync when external value changes (e.g. barcode prefill) and keyboard is not open
  useEffect(() => {
    if (!isOpen) {
      setExpr(value)
      lastCommitted.current = value
    }
  }, [value, isOpen])

  // Track native keyboard height via visualViewport so toolbar stays above it
  useEffect(() => {
    if (!isOpen || !isMobile.current) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const kh = window.innerHeight - vv.height - vv.offsetTop
      setBottom(Math.max(0, kh))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [isOpen])

  function handleFocus() {
    setExpr(value)
    lastCommitted.current = value
    setIsError(false)
    setIsOpen(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setExpr(e.target.value)
    setIsError(false)
  }

  function handleBlur() {
    if (expr && OPERATORS_RE.test(expr)) {
      const result = evaluateExpression(expr)
      if (result !== null) {
        const str = formatResult(result)
        onChange(str)
        setExpr(str)
        lastCommitted.current = str
      } else {
        setExpr(lastCommitted.current) // revert invalid expression
      }
    } else {
      const n = parseFloat(expr)
      if (!isNaN(n)) {
        onChange(expr)
        lastCommitted.current = expr
      } else {
        setExpr(lastCommitted.current) // revert empty / non-numeric
      }
    }
    setIsOpen(false)
    setIsError(false)
  }

  function handleKey(key: string) {
    const { expr: nextExpr, commit } = handleCalcKey(key, expr)
    setExpr(nextExpr)
    if (commit !== null) {
      onChange(commit)
      lastCommitted.current = commit
      setIsError(false)
    } else if (key === '=') {
      setIsError(true)
    } else {
      setIsError(false)
    }
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
      <input
        className={className}
        inputMode="decimal"
        placeholder={placeholder}
        value={expr}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {isOpen && (
        <CalculatorKeyboard bottom={bottom} isError={isError} onKey={handleKey} />
      )}
    </>
  )
}
