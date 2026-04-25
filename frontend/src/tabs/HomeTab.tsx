import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PlusCircleIcon,
  BeakerIcon,
  ListBulletIcon,
  ClockIcon,
} from '@heroicons/react/24/solid'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import Modal from '../components/Modal'
import BarcodeScanner from '../components/BarcodeScanner'
import TimestampPicker from '../components/TimestampPicker'
import { Field, UnitPreview, inputCls, primaryBtn } from '../components/FormFields'
import { toLocalDateKey, todayKey } from '../utils'
import type { TrackerTemplate, TrackerEntry } from '../types'
import { useSettings } from '../contexts/SettingsContext'
import { useModuleAdapter } from '../hooks/useModuleAdapter'
import { useCreateEntry } from '../api/entries'
import { useCreateTemplate, useUpdateTemplate } from '../api/templates'
import { useCreateCaffeineEntry } from '../api/caffeine-entries'
import { useCreateCaffeineTemplate, useUpdateCaffeineTemplate } from '../api/caffeine-templates'
import { lookupBarcode, type BarcodeResult } from '../api/barcode'

interface QuickLogSnapshot {
  todayTopTwo: Array<{ template: TrackerTemplate; count: number; lastTs: string }>
  alltimeItems: TrackerTemplate[]
  pendingDrinks: TrackerEntry[]
}

export default function HomeTab({ onToast, onScannerOpen }: { onToast: (msg: string) => void; onScannerOpen?: (open: boolean) => void }) {
  const adapter = useModuleAdapter()
  const { openSettings, updateSettings, settings } = useSettings()
  const barcodeStrategy = settings.barcodeStrategy
  const { templates, entries, isEntriesFetched, activeModule } = adapter

  const [modal, setModal] = useState<'new' | 'enter' | 'other' | 'pending' | 'scanner' | 'scan-match' | null>(null)
  const [scanPrefill, setScanPrefill] = useState<BarcodeResult | null>(null)
  const [scanCode, setScanCode] = useState<string | null>(null)
  const [scanMatchTemplate, setScanMatchTemplate] = useState<TrackerTemplate | null>(null)
  const [pendingScanTemplateId, setPendingScanTemplateId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<QuickLogSnapshot>({ todayTopTwo: [], alltimeItems: [], pendingDrinks: [] })

  useEffect(() => { onScannerOpen?.(modal === 'scanner') }, [modal, onScannerOpen])

  useEffect(() => {
    if (!pendingScanTemplateId) return
    const matched = templates.find((t) => t.id === pendingScanTemplateId)
    if (matched) {
      setScanMatchTemplate(matched)
      setModal('scan-match')
      setPendingScanTemplateId(null)
    }
  }, [templates, pendingScanTemplateId])

  // Keep refs current so refreshSnapshot always reads latest data without being a dep
  const templatesRef = useRef(templates)
  const entriesRef = useRef(entries)

  const refreshSnapshot = useCallback(() => {
    const tmpl = templatesRef.current
    const entr = entriesRef.current
    const today = todayKey()

    const statsMap = new Map<string, { template: TrackerTemplate; count: number; lastTs: string }>()
    for (const entry of entr) {
      if (toLocalDateKey(entry.timestamp) !== today || !entry.templateId) continue
      const t = tmpl.find((t) => t.id === entry.templateId)
      if (!t) continue
      const s = statsMap.get(entry.templateId)
      if (!s) statsMap.set(entry.templateId, { template: t, count: 1, lastTs: entry.timestamp })
      else { s.count++; if (entry.timestamp > s.lastTs) s.lastTs = entry.timestamp }
    }
    const todayTopTwo = [...statsMap.values()]
      .sort((a, b) => b.count - a.count || b.lastTs.localeCompare(a.lastTs))
      .slice(0, 2)

    const pendingMap = new Map<string, TrackerEntry>()
    for (const entry of entr) {
      if (entry.templateId !== null || entry.isMarked || !entry.customName) continue
      const existing = pendingMap.get(entry.customName)
      if (!existing || entry.timestamp > existing.timestamp) pendingMap.set(entry.customName, entry)
    }
    const pendingDrinks = [...pendingMap.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    const todayIds = new Set(todayTopTwo.map((s) => s.template.id))
    const alltimeCount = 5 - todayTopTwo.length - (pendingDrinks.length > 0 ? 1 : 0)
    const alltimeItems = [...tmpl]
      .filter((t) => !todayIds.has(t.id))
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, alltimeCount)

    setSnapshot({ todayTopTwo, alltimeItems, pendingDrinks })
  }, [])

  useEffect(() => { templatesRef.current = templates }, [templates])
  useEffect(() => { entriesRef.current = entries }, [entries])

  // Refresh on module switch (uses whatever is in refs at that point)
  useEffect(() => {
    refreshSnapshot()
  }, [activeModule, refreshSnapshot])

  // Refresh once entries have definitively loaded — catches the case where templates
  // arrive from cache before entries, leaving today/pending absent from the snapshot
  useEffect(() => {
    if (isEntriesFetched) refreshSnapshot()
  }, [isEntriesFetched, refreshSnapshot])

  async function handleScan(code: string) {
    setModal(null)
    try {
      const result = await lookupBarcode(code, activeModule, barcodeStrategy)
      if (result.source === 'local') {
        if (result.module && result.module !== activeModule && result.template_id) {
          updateSettings({ activeModule: result.module })
          setPendingScanTemplateId(result.template_id)
          return
        }
        const matched = templates.find((t) => t.id === result.template_id)
        if (matched) {
          setScanMatchTemplate(matched)
          setModal('scan-match')
          return
        }
      }
      if ((result.source === 'off' || result.source === 'ah' || result.source === 'local') && result.name) {
        setScanPrefill(result)
        setScanCode(code)
        setModal('new')
        return
      }
      onToast('Product not found')
    } catch {
      onToast('Barcode lookup failed')
    }
  }

  const { todayTopTwo, alltimeItems, pendingDrinks } = snapshot
  const showQuickLog = alltimeItems.length > 0 || todayTopTwo.length > 0 || pendingDrinks.length > 0

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">DrinkLog</h1>
            <span className="text-sm text-neutral-400 dark:text-neutral-500">{activeModule}</span>
          </div>
          <div className="flex items-center gap-2">
            <StrategyPill value={barcodeStrategy} onChange={(s) => updateSettings({ barcodeStrategy: s })} />
            <button
              onClick={() => setModal('scanner')}
              className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-transform"
              aria-label="Scan barcode"
            >
              <BarcodeScanIcon />
            </button>
            <button
              onClick={openSettings}
              className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-transform"
            >
              <Cog6ToothIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      <div data-dbg-zone="LIST" className="flex-1 min-h-0 overflow-y-auto touch-pan-y px-4 pb-4">
        <div className="flex flex-col gap-2 mb-6">
          <ActionCard
            title="New"
            subtitle={activeModule === 'caffeine' ? 'Create a new caffeine drink' : 'Create a new drink type'}
            icon={<PlusCircleIcon className="w-6 h-6 text-blue-500" />}
            onClick={() => setModal('new')}
          />
          <ActionCard
            title={activeModule === 'caffeine' ? 'Enter mg' : 'Enter ml'}
            subtitle="Quick amount, no name"
            icon={<BeakerIcon className="w-6 h-6 text-blue-500" />}
            onClick={() => setModal('enter')}
          />
          <ActionCard
            title="Other"
            subtitle="Pick from your drinks"
            icon={<ListBulletIcon className="w-6 h-6 text-blue-500" />}
            onClick={() => setModal('other')}
          />
        </div>

        {showQuickLog && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">
              Quick Log
            </p>
            <div className="flex flex-col gap-2">
              {todayTopTwo.map(({ template }) => (
                <TemplateButton key={template.id} template={template} onClick={() => { adapter.logFromTemplate(template); onToast(`Logged: ${template.name}`) }} />
              ))}

              {todayTopTwo.length > 0 && alltimeItems.length > 0 && (
                <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mt-1 px-1">Most used</p>
              )}

              {alltimeItems.map((t) => (
                <TemplateButton key={t.id} template={t} onClick={() => { adapter.logFromTemplate(t); onToast(`Logged: ${t.name}`) }} />
              ))}

              {pendingDrinks.length > 0 && (
                <button
                  onClick={() => setModal('pending')}
                  className="w-full flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
                >
                  <ClockIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">New drinks</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {pendingDrinks.length} unconfirmed
                    </p>
                  </div>
                  <span className="text-neutral-400 text-sm">&rsaquo;</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {activeModule === 'alcohol' ? (
        <NewAlcoholModal
          open={modal === 'new'}
          onClose={() => { setScanPrefill(null); setScanCode(null); setModal(null) }}
          templates={templates}
          prefill={scanPrefill}
          barcode={scanCode}
          onLogged={(name) => { setScanPrefill(null); setScanCode(null); onToast(`Logged: ${name}`); setModal(null) }}
        />
      ) : (
        <NewCaffeineModal
          open={modal === 'new'}
          onClose={() => { setScanPrefill(null); setScanCode(null); setModal(null) }}
          templates={templates}
          prefill={scanPrefill}
          barcode={scanCode}
          onLogged={(name) => { setScanPrefill(null); setScanCode(null); onToast(`Logged: ${name}`); setModal(null) }}
        />
      )}
      {activeModule === 'alcohol' ? (
        <EnterAlcoholModal open={modal === 'enter'} onClose={() => setModal(null)} onLogged={(val) => { onToast(`Logged: ${val}`); setModal(null) }} />
      ) : (
        <EnterCaffeineModal open={modal === 'enter'} onClose={() => setModal(null)} onLogged={(val) => { onToast(`Logged: ${val}`); setModal(null) }} />
      )}
      <OtherModal
        open={modal === 'other'}
        onClose={() => setModal(null)}
        templates={templates}
        onLog={(t, count, timestamp) => adapter.logFromTemplateWithOptions(t, count, timestamp)}
        onLogged={(name) => { onToast(`Logged: ${name}`); setModal(null) }}
      />
      <PendingDrinksModal
        open={modal === 'pending'}
        onClose={() => setModal(null)}
        entries={pendingDrinks}
        onLog={(e, count, timestamp) => adapter.logFromPendingEntry(e, count, timestamp)}
        onLogged={(name) => { onToast(`Logged: ${name}`); setModal(null) }}
      />
      {modal === 'scanner' && (
        <BarcodeScanner onScan={handleScan} onClose={() => setModal(null)} />
      )}
      <ScanMatchModal
        open={modal === 'scan-match'}
        template={scanMatchTemplate}
        onClose={() => { setScanMatchTemplate(null); setModal(null) }}
        onLog={(t, count, timestamp) => adapter.logFromTemplateWithOptions(t, count, timestamp)}
        onLogged={(name) => { setScanMatchTemplate(null); onToast(`Logged: ${name}`); setModal(null) }}
      />
    </div>
  )
}

function TemplateButton({ template, onClick }: { template: TrackerTemplate; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{template.name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{template.displayInfo}</p>
      </div>
      <span className="text-neutral-400 text-sm">&rsaquo;</span>
    </button>
  )
}

function ActionCard({ title, subtitle, icon, onClick }: {
  title: string; subtitle: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3.5 active:scale-[0.98] transition-transform text-left">
      {icon}
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      </div>
      <span className="text-neutral-400 text-sm">&rsaquo;</span>
    </button>
  )
}

// NewAlcoholModal — uses useCreateEntry directly (module-specific modal, adapter bypass acceptable)
function NewAlcoholModal({ open, onClose, templates, prefill, barcode, onLogged }: {
  open: boolean; onClose: () => void; templates: TrackerTemplate[]
  prefill?: BarcodeResult | null; barcode?: string | null; onLogged: (name: string) => void
}) {
  const createEntry = useCreateEntry()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const [name, setName] = useState('')
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => {
    if (open) {
      setTs(new Date())
      if (prefill) {
        setName(prefill.name ? `${prefill.name} Ⓑ` : '')
        setMl(prefill.ml != null ? String(prefill.ml) : '')
        setAbv(prefill.abv != null ? String(prefill.abv) : '')
      } else {
        setName(''); setMl(''); setAbv('')
      }
      setError(null); setCount(1)
    }
  }, [open, prefill])

  const duplicateTemplate = templates.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isDuplicate = !!duplicateTemplate
  const isValid = name.trim().length > 0 && !isNaN(parseFloat(ml)) && !isNaN(parseFloat(abv))

  const mlMissing = prefill && prefill.ml == null
  const abvMissing = prefill && prefill.abv == null
  const dashedCls = ' border-dashed border-2 border-neutral-400 dark:border-neutral-500'

  async function handleSubmit() {
    const timestamp = ts.toISOString()
    if (barcode) {
      // Scan flow: create/reuse a template so the barcode is persisted for future lookups
      try {
        let templateId: string
        if (isDuplicate && duplicateTemplate) {
          templateId = duplicateTemplate.id
        } else {
          const t = await createTemplate.mutateAsync({
            name: name.trim(), default_ml: parseFloat(ml), default_abv: parseFloat(abv), barcode,
          })
          templateId = t.id
        }
        for (let i = 0; i < count; i++) {
          await createEntry.mutateAsync({ template_id: templateId, ml: parseFloat(ml), abv: parseFloat(abv), timestamp })
        }
        if (isDuplicate && duplicateTemplate) {
          await updateTemplate.mutateAsync({ id: templateId, barcode, usage_count: duplicateTemplate.usage_count + count })
        } else {
          await updateTemplate.mutateAsync({ id: templateId, usage_count: count })
        }
      } catch {
        setError('Something went wrong, please try again')
        return
      }
    } else {
      if (isDuplicate) { setError(`"${name.trim()}" already exists — use Other to log it`); return }
      for (let i = 0; i < count; i++) {
        await createEntry.mutateAsync({ custom_name: name.trim(), ml: parseFloat(ml), abv: parseFloat(abv), timestamp })
      }
    }
    const logged = name.trim()
    setName(''); setMl(''); setAbv(''); setError(null); setTs(new Date()); setCount(1)
    onLogged(logged)
  }

  return (
    <Modal open={open} onClose={() => { setName(''); setMl(''); setAbv(''); setError(null); setTs(new Date()); setCount(1); onClose() }} title="New Alcohol Drink">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        {prefill && prefill.strategy_used != null && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2 font-mono">
            {(['OFF+', 'AH', 'Hybrid'] as const)[prefill.strategy_used - 1]} · {prefill.actual_source ?? '—'} · {prefill.latency_ms != null ? `${Math.round(prefill.latency_ms)}ms` : '—'}
          </div>
        )}
        <Field label="Drink name">
          <input className={inputCls} placeholder="e.g. Lager, House Wine…" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="Amount (ml)">
          <input className={inputCls + (mlMissing ? dashedCls : '')} inputMode="decimal" placeholder="330" value={ml} onChange={(e) => setMl(e.target.value)} />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls + (abvMissing ? dashedCls : '')} inputMode="decimal" placeholder="5.0" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        <UnitPreview ml={ml} abv={abv} />
        <div className="flex gap-2">
          <Stepper value={count} onChange={setCount} />
          <button onClick={handleSubmit} disabled={!isValid || createTemplate.isPending || createEntry.isPending} className={primaryBtn + ' flex-1'}>Log</button>
        </div>
      </div>
    </Modal>
  )
}

// NewCaffeineModal — uses useCreateCaffeineEntry directly (module-specific modal)
export function NewCaffeineModal({ open, onClose, templates, prefill, barcode, onLogged }: {
  open: boolean; onClose: () => void; templates: TrackerTemplate[]
  prefill?: BarcodeResult | null; barcode?: string | null; onLogged: (name: string) => void
}) {
  const createEntry = useCreateCaffeineEntry()
  const createTemplate = useCreateCaffeineTemplate()
  const updateTemplate = useUpdateCaffeineTemplate()
  const [name, setName] = useState('')
  const [mg, setMg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => {
    if (open) {
      setTs(new Date())
      if (prefill) {
        setName(prefill.name ? `${prefill.name} Ⓑ` : '')
        setMg(prefill.mg != null ? String(prefill.mg) : '')
      } else {
        setName(''); setMg('')
      }
      setError(null); setCount(1)
    }
  }, [open, prefill])

  const duplicateTemplate = templates.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isDuplicate = !!duplicateTemplate
  const isValid = name.trim().length > 0 && !isNaN(parseFloat(mg))

  const mgMissing = prefill && prefill.mg == null
  const dashedCls = ' border-dashed border-2 border-neutral-400 dark:border-neutral-500'

  async function handleSubmit() {
    const timestamp = ts.toISOString()
    if (barcode) {
      try {
        let templateId: string
        if (isDuplicate && duplicateTemplate) {
          templateId = duplicateTemplate.id
        } else {
          const t = await createTemplate.mutateAsync({
            name: name.trim(), default_mg: parseFloat(mg), barcode,
          })
          templateId = t.id
        }
        for (let i = 0; i < count; i++) {
          await createEntry.mutateAsync({ template_id: templateId, mg: parseFloat(mg), timestamp })
        }
        if (isDuplicate && duplicateTemplate) {
          await updateTemplate.mutateAsync({ id: templateId, barcode, usage_count: duplicateTemplate.usage_count + count })
        } else {
          await updateTemplate.mutateAsync({ id: templateId, usage_count: count })
        }
      } catch {
        setError('Something went wrong, please try again')
        return
      }
    } else {
      if (isDuplicate) { setError(`"${name.trim()}" already exists — use Other to log it`); return }
      for (let i = 0; i < count; i++) {
        await createEntry.mutateAsync({ custom_name: name.trim(), mg: parseFloat(mg), timestamp })
      }
    }
    const logged = name.trim()
    setName(''); setMg(''); setError(null); setTs(new Date()); setCount(1)
    onLogged(logged)
  }

  return (
    <Modal open={open} onClose={() => { setName(''); setMg(''); setError(null); setTs(new Date()); setCount(1); onClose() }} title="New Caffeine Drink">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        {prefill && prefill.strategy_used != null && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded-lg px-3 py-2 font-mono">
            {(['OFF+', 'AH', 'Hybrid'] as const)[prefill.strategy_used - 1]} · {prefill.actual_source ?? '—'} · {prefill.latency_ms != null ? `${Math.round(prefill.latency_ms)}ms` : '—'}
          </div>
        )}
        <Field label="Drink name">
          <input className={inputCls} placeholder="e.g. Coffee, Energy Drink…" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="Caffeine (mg)">
          <input className={inputCls + (mgMissing ? dashedCls : '')} inputMode="decimal" placeholder="80" value={mg} onChange={(e) => setMg(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Stepper value={count} onChange={setCount} />
          <button onClick={handleSubmit} disabled={!isValid || createTemplate.isPending || createEntry.isPending} className={primaryBtn + ' flex-1'}>Log</button>
        </div>
      </div>
    </Modal>
  )
}

function EnterAlcoholModal({ open, onClose, onLogged }: { open: boolean; onClose: () => void; onLogged: (val: string) => void }) {
  const createEntry = useCreateEntry()
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isValid = !isNaN(parseFloat(ml)) && !isNaN(parseFloat(abv))

  function handleSubmit() {
    const val = `${ml}ml`
    createEntry.mutate(
      { ml: parseFloat(ml), abv: parseFloat(abv), timestamp: ts.toISOString() },
      { onSuccess: () => { setMl(''); setAbv(''); setTs(new Date()); onLogged(val) } },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enter Amount">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <Field label="Amount (ml)">
          <input className={inputCls} inputMode="decimal" placeholder="330" value={ml} onChange={(e) => setMl(e.target.value)} />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls} inputMode="decimal" placeholder="5.0" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        <UnitPreview ml={ml} abv={abv} />
        <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn}>Log</button>
      </div>
    </Modal>
  )
}

export function EnterCaffeineModal({ open, onClose, onLogged }: { open: boolean; onClose: () => void; onLogged: (val: string) => void }) {
  const createEntry = useCreateCaffeineEntry()
  const [mg, setMg] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isValid = !isNaN(parseFloat(mg))

  function handleSubmit() {
    const val = `${mg}mg`
    createEntry.mutate(
      { mg: parseFloat(mg), timestamp: ts.toISOString() },
      { onSuccess: () => { setMg(''); setTs(new Date()); onLogged(val) } },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enter Amount">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <Field label="Caffeine (mg)">
          <input className={inputCls} inputMode="decimal" placeholder="80" value={mg} onChange={(e) => setMg(e.target.value)} />
        </Field>
        <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn}>Log</button>
      </div>
    </Modal>
  )
}

function OtherModal({ open, onClose, templates, onLog, onLogged }: {
  open: boolean
  onClose: () => void
  templates: TrackerTemplate[]
  onLog: (t: TrackerTemplate, count: number, timestamp: string) => Promise<void>
  onLogged: (name: string) => void
}) {
  const [search, setSearch] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  async function logTemplate(t: TrackerTemplate) {
    await onLog(t, count, ts.toISOString())
    setSearch('')
    setTs(new Date())
    setCount(1)
    onLogged(t.name)
  }

  return (
    <Modal open={open} onClose={() => { setSearch(''); setTs(new Date()); setCount(1); onClose() }} title="Other Drinks">
      <div className="flex flex-col gap-2">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <input className={inputCls} placeholder="Search drinks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Quantity</span>
          <Stepper value={count} onChange={setCount} />
        </div>
        {filtered.length === 0 && <p className="text-sm text-neutral-400 py-4 text-center">No drinks found</p>}
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => logTemplate(t)}
              className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 active:scale-[0.98] transition-transform text-left">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t.name}</p>
                <p className="text-xs text-neutral-500 tabular-nums">{t.displayInfo}</p>
              </div>
              <span className="text-blue-500 text-lg">+</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function PendingDrinksModal({ open, onClose, entries, onLog, onLogged }: {
  open: boolean
  onClose: () => void
  entries: TrackerEntry[]
  onLog: (e: TrackerEntry, count: number, timestamp: string) => Promise<void>
  onLogged: (name: string) => void
}) {
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  async function logDrink(entry: TrackerEntry) {
    await onLog(entry, count, ts.toISOString())
    setTs(new Date())
    setCount(1)
    onLogged(entry.customName!)
  }

  return (
    <Modal open={open} onClose={() => { setTs(new Date()); setCount(1); onClose() }} title="New Drinks">
      <div className="flex flex-col gap-2">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Quantity</span>
          <Stepper value={count} onChange={setCount} />
        </div>
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {entries.map((entry) => (
            <button key={entry.id} onClick={() => logDrink(entry)}
              className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 active:scale-[0.98] transition-transform text-left">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{entry.customName}</p>
                <p className="text-xs text-neutral-500 tabular-nums">{entry.displayInfo}</p>
              </div>
              <span className="text-blue-500 text-lg">+</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function ScanMatchModal({ open, template, onClose, onLog, onLogged }: {
  open: boolean
  template: TrackerTemplate | null
  onClose: () => void
  onLog: (t: TrackerTemplate, count: number, timestamp: string) => Promise<void>
  onLogged: (name: string) => void
}) {
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  async function handleLog() {
    if (!template) return
    await onLog(template, count, ts.toISOString())
    setTs(new Date()); setCount(1)
    onLogged(template.name)
  }

  if (!template) return null

  return (
    <Modal open={open} onClose={() => { setTs(new Date()); setCount(1); onClose() }} title="Log Scanned Drink">
      <div className="flex flex-col gap-3">
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{template.name}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{template.displayInfo}</p>
        </div>
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <div className="flex gap-2">
          <Stepper value={count} onChange={setCount} />
          <button onClick={handleLog} className={primaryBtn + ' flex-1'}>Log</button>
        </div>
      </div>
    </Modal>
  )
}

function StrategyPill({ value, onChange }: { value: 1 | 2 | 3; onChange: (s: 1 | 2 | 3) => void }) {
  const labels: Record<1 | 2 | 3, string> = { 1: 'OFF+', 2: 'AH', 3: 'Hybrid' }
  return (
    <div className="flex rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 text-xs font-medium">
      {([1, 2, 3] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={
            'px-2 py-1 transition-colors ' +
            (value === s
              ? 'bg-blue-500 text-white'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400')
          }
        >
          {labels[s]}
        </button>
      ))}
    </div>
  )
}

function BarcodeScanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <line x1="7" y1="8" x2="7" y2="16" strokeWidth={2} />
      <line x1="10" y1="8" x2="10" y2="16" strokeWidth={1} />
      <line x1="12.5" y1="8" x2="12.5" y2="16" strokeWidth={2} />
      <line x1="15" y1="8" x2="15" y2="16" strokeWidth={1} />
      <line x1="17" y1="8" x2="17" y2="16" strokeWidth={2} />
    </svg>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-xl flex-shrink-0">
      <button onClick={() => onChange(Math.max(1, value - 1))}
        className="px-3 py-2 text-lg font-semibold text-neutral-700 dark:text-neutral-300 active:scale-90 transition-transform">−</button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</span>
      <button onClick={() => onChange(value + 1)}
        className="px-3 py-2 text-lg font-semibold text-neutral-700 dark:text-neutral-300 active:scale-90 transition-transform">+</button>
    </div>
  )
}
