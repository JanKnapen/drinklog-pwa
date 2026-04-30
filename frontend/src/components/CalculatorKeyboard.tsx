import { createPortal } from 'react-dom'

interface Props {
  bottom: number
  isError: boolean
  onKey: (key: string) => void
}

const OPS = ['+', '−', '×', '÷', '=']

// Operator toolbar that floats above the native keyboard.
// bottom is set by CalcInput using window.visualViewport to track keyboard height.
export function CalculatorKeyboard({ bottom, isError, onKey }: Props) {
  return createPortal(
    <div
      className="fixed inset-x-0 z-[50] flex border-t border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800"
      style={{ bottom }}
    >
      {OPS.map((op) => (
        <button
          key={op}
          type="button"
          className={`flex-1 py-3 text-xl select-none active:bg-neutral-200 dark:active:bg-neutral-700 ${
            op === '='
              ? isError
                ? 'text-red-500 font-semibold'
                : 'text-blue-500 font-semibold'
              : 'font-medium text-neutral-700 dark:text-neutral-200'
          }`}
          onPointerDown={(e) => {
            e.preventDefault() // keep focus on the input
            onKey(op)
          }}
        >
          {op}
        </button>
      ))}
    </div>,
    document.body,
  )
}
