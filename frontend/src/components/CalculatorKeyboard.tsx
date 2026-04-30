import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  expression: string
  isError: boolean
  onKey: (key: string) => void
}

const OPERATORS = ['+', '−', '×', '÷', '=']
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

const opBtnCls =
  'flex items-center justify-center h-11 rounded-lg text-lg font-medium ' +
  'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 ' +
  'active:bg-neutral-300 dark:active:bg-neutral-600 select-none'

const digitBtnCls =
  'flex items-center justify-center h-16 rounded-xl text-xl font-medium ' +
  'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 ' +
  'active:bg-neutral-300 dark:active:bg-neutral-600 select-none'

const eqBtnCls =
  'flex items-center justify-center h-11 rounded-lg text-lg font-semibold ' +
  'bg-blue-500 text-white active:bg-blue-600 select-none'

export function CalculatorKeyboard({ expression, isError, onKey }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return createPortal(
    <div
      className={`fixed inset-x-0 bottom-0 z-[51] bg-neutral-100 dark:bg-neutral-900 rounded-t-2xl shadow-2xl pb-safe transform transition-transform duration-200 ${mounted ? 'translate-y-0' : 'translate-y-full'}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* z-[51] sits above Modal (z-40) */}
      {/* Display bar */}
      <div
        className={`px-4 py-3 text-right text-xl font-mono min-h-[52px] ${
          isError
            ? 'text-red-500'
            : 'text-neutral-900 dark:text-neutral-100'
        }`}
      >
        {expression || <span className="text-neutral-400 dark:text-neutral-600">0</span>}
      </div>

      {/* Operator row */}
      <div className="grid grid-cols-5 gap-1.5 px-3 mb-1.5">
        {OPERATORS.map((op) => (
          <button
            key={op}
            type="button"
            className={op === '=' ? eqBtnCls : opBtnCls}
            onPointerDown={() => onKey(op)}
          >
            {op}
          </button>
        ))}
      </div>

      {/* Digit grid */}
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className={digitBtnCls}
            onPointerDown={() => onKey(d)}
          >
            {d === '⌫' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
              </svg>
            ) : d}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
