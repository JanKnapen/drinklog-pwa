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

function findScrollContainer(el: Element): Element | null {
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    const oy = getComputedStyle(cur).overflowY
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return null
}

interface Entry { t: number; zone: string; target: string; scroll: string }

export default function DebugOverlay() {
  const [log, setLog] = useState<Entry[]>([])
  const [gesture, setGesture] = useState('')

  useEffect(() => {
    let startY = 0
    let scrollEl: Element | null = null
    let scrollTopAtStart = 0

    function onTouchStart(e: TouchEvent) {
      const el = e.target as Element
      startY = e.touches[0].clientY
      scrollEl = findScrollContainer(el)
      scrollTopAtStart = scrollEl ? scrollEl.scrollTop : 0

      const tag = el.tagName.toLowerCase()
      const cls = [...el.classList].slice(0, 3).join('.')
      setLog(prev => [{
        t: Date.now() - t0,
        zone: getZone(el),
        target: cls ? `${tag}.${cls}` : tag,
        scroll: getScrollInfo(el),
      }, ...prev].slice(0, 5))
      setGesture('waiting...')
    }

    function onTouchMove(e: TouchEvent) {
      const dy = Math.round(e.touches[0].clientY - startY)
      if (Math.abs(dy) < 5) return
      const scrolled = scrollEl ? Math.round(scrollEl.scrollTop - scrollTopAtStart) : 0
      setGesture(`dy=${dy} scrolled=${scrolled}`)
    }

    function onTouchEnd() {
      const scrolled = scrollEl ? Math.round(scrollEl.scrollTop - scrollTopAtStart) : 0
      setGesture(g => (g === 'waiting...' ? 'tap (no move)' : g) + ` | END scrolled=${scrolled}`)
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#b00', color: '#fff', fontSize: '9px', lineHeight: '1.45',
      padding: '3px 5px', fontFamily: 'monospace', pointerEvents: 'none',
    }}>
      {gesture && <div style={{ color: '#ff0', marginBottom: 2 }}>▶ {gesture}</div>}
      {log.length === 0
        ? 'touch anywhere...'
        : log.map((e, i) => (
          <div key={i} style={{ opacity: Math.max(0.3, 1 - i * 0.18) }}>
            [{e.t}ms] <b>{e.zone}</b> › {e.target} | {e.scroll}
          </div>
        ))
      }
    </div>
  )
}
