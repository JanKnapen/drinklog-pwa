import { useState, useEffect } from 'react'

const t0 = Date.now()

function getZone(el: Element): string {
  let cur: Element | null = el
  while (cur) {
    const z = cur.getAttribute('data-dbg-zone')
    if (z) return z
    cur = cur.parentElement
  }
  return '?'
}

function getScrollInfo(el: Element): string {
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    const oy = getComputedStyle(cur).overflowY
    if (oy === 'auto' || oy === 'scroll') {
      const fits = cur.scrollHeight <= cur.clientHeight
      return `${fits ? 'FITS' : 'OK'} ${cur.clientHeight}/${cur.scrollHeight}`
    }
    if (oy === 'hidden') {
      const cls = [...cur.classList].slice(0, 2).join('.')
      return `BLOCKED:hidden@${cur.tagName.toLowerCase()}.${cls}`
    }
    cur = cur.parentElement
  }
  return 'no-ancestor'
}

interface Entry { t: number; zone: string; target: string; scroll: string }

export default function DebugOverlay() {
  const [log, setLog] = useState<Entry[]>([])

  useEffect(() => {
    function onTouch(e: TouchEvent) {
      const el = e.target as Element
      const tag = el.tagName.toLowerCase()
      const cls = [...el.classList].slice(0, 3).join('.')
      setLog(prev => [{
        t: Date.now() - t0,
        zone: getZone(el),
        target: cls ? `${tag}.${cls}` : tag,
        scroll: getScrollInfo(el),
      }, ...prev].slice(0, 5))
    }
    window.addEventListener('touchstart', onTouch, { passive: true })
    return () => window.removeEventListener('touchstart', onTouch)
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#b00', color: '#fff', fontSize: '9px', lineHeight: '1.45',
      padding: '3px 5px', fontFamily: 'monospace', pointerEvents: 'none',
    }}>
      {log.length === 0
        ? '▶ touch anywhere...'
        : log.map((e, i) => (
          <div key={i} style={{ opacity: Math.max(0.3, 1 - i * 0.18) }}>
            [{e.t}ms] <b>{e.zone}</b> › {e.target} | {e.scroll}
          </div>
        ))
      }
    </div>
  )
}
