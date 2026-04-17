import { useRef, useEffect } from 'react'

const ITEM_H = 36

function DrumColumn({ items, selectedIndex, onChange }: {
  items: string[]
  selectedIndex: number
  onChange: (i: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const changing = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()
  const didMount = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (!didMount.current) {
      didMount.current = true
      changing.current = true
      el.scrollTop = selectedIndex * ITEM_H
      setTimeout(() => { changing.current = false }, 50)
      return
    }

    changing.current = true
    el.scrollTo({ top: selectedIndex * ITEM_H, behavior: 'smooth' })
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => { changing.current = false }, 400)
  }, [selectedIndex])

  function onScroll() {
    if (changing.current) return
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)))
      onChangeRef.current(i)
    }, 120)
  }

  return (
    <div className="relative flex-1">
      {/* Selection indicator */}
      <div
        className="absolute inset-x-0 pointer-events-none z-10 border-y border-neutral-200 dark:border-neutral-700"
        style={{ top: ITEM_H, height: ITEM_H }}
      />
      {/* Top fade */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none z-10 bg-gradient-to-b from-white to-transparent dark:from-neutral-900"
        style={{ height: ITEM_H }}
      />
      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-10 bg-gradient-to-t from-white to-transparent dark:from-neutral-900"
        style={{ height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="drum-scroll"
        style={{
          height: ITEM_H * 3,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
        }}
      >
        <div style={{ height: ITEM_H }} />
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-sm font-medium text-neutral-900 dark:text-neutral-100"
            style={{ height: ITEM_H, scrollSnapAlign: 'center' }}
          >
            {item}
          </div>
        ))}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export default function TimestampPicker({ value, onChange }: {
  value: Date
  onChange: (d: Date) => void
}) {
  const month = value.getMonth()
  const day = value.getDate()
  const hour = value.getHours()

  const numDays = daysInMonth(value.getFullYear(), month)
  const days = Array.from({ length: numDays }, (_, i) => String(i + 1))
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

  function update(field: 'month' | 'day' | 'hour', index: number) {
    const d = new Date(value)
    if (field === 'month') {
      d.setMonth(index)
      const max = daysInMonth(d.getFullYear(), d.getMonth())
      if (d.getDate() > max) d.setDate(max)
    } else if (field === 'day') {
      d.setDate(index + 1)
    } else {
      d.setHours(index)
    }
    onChange(d)
  }

  return (
    <div className="flex gap-1 rounded-xl bg-neutral-50 dark:bg-neutral-800 overflow-hidden">
      <DrumColumn items={MONTHS} selectedIndex={month} onChange={(i) => update('month', i)} />
      <DrumColumn items={days} selectedIndex={day - 1} onChange={(i) => update('day', i)} />
      <DrumColumn items={hours} selectedIndex={hour} onChange={(i) => update('hour', i)} />
    </div>
  )
}
