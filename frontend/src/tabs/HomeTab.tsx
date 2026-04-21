import { useState, useEffect } from 'react'
import {
  PlusCircleIcon,
  BeakerIcon,
  ListBulletIcon,
  ClockIcon,
} from '@heroicons/react/24/solid'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import Modal from '../components/Modal'
import TimestampPicker from '../components/TimestampPicker'
import { Field, UnitPreview, inputCls, primaryBtn } from '../components/FormFields'
import { toLocalDateKey, todayKey } from '../utils'
import type { TrackerTemplate, TrackerEntry } from '../types'
import { useSettings } from '../contexts/SettingsContext'
import { useModuleAdapter } from '../hooks/useModuleAdapter'
import { useCreateEntry } from '../api/entries'
import { useCreateCaffeineEntry } from '../api/caffeine-entries'

export default function HomeTab({ onToast }: { onToast: (msg: string) => void }) {
  const adapter = useModuleAdapter()
  const { openSettings } = useSettings()
  const { templates, entries, activeModule } = adapter

  const [modal, setModal] = useState<'new' | 'enter' | 'other' | 'pending' | null>(null)

  // Today's top 2 templates by log count, tiebreak by most recent entry
  const today = todayKey()
  const statsMap = new Map<string, { template: TrackerTemplate; count: number; lastTs: string }>()
  for (const entry of entries) {
    if (toLocalDateKey(entry.timestamp) !== today || !entry.templateId) continue
    const tmpl = templates.find((t) => t.id === entry.templateId)
    if (!tmpl) continue
    const s = statsMap.get(entry.templateId)
    if (!s) {
      statsMap.set(entry.templateId, { template: tmpl, count: 1, lastTs: entry.timestamp })
    } else {
      s.count++
      if (entry.timestamp > s.lastTs) s.lastTs = entry.timestamp
    }
  }
  const todayTopTwo = [...statsMap.values()]
    .sort((a, b) => b.count - a.count || b.lastTs.localeCompare(a.lastTs))
    .slice(0, 2)

  // Unconfirmed custom_name entries, deduplicated by name (keep most recent per name)
  const pendingMap = new Map<string, TrackerEntry>()
  for (const entry of entries) {
    if (entry.templateId !== null || entry.isMarked || !entry.customName) continue
    const existing = pendingMap.get(entry.customName)
    if (!existing || entry.timestamp > existing.timestamp) pendingMap.set(entry.customName, entry)
  }
  const pendingDrinks = [...pendingMap.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  // Alltime: exclude today's top templates, fill up to 5 total slots
  const todayIds = new Set(todayTopTwo.map((s) => s.template.id))
  const alltimeCount = 5 - todayTopTwo.length - (pendingDrinks.length > 0 ? 1 : 0)
  const alltimeItems = [...templates]
    .filter((t) => !todayIds.has(t.id))
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, alltimeCount)

  const showQuickLog = alltimeItems.length > 0 || todayTopTwo.length > 0 || pendingDrinks.length > 0

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">DrinkLog</h1>
            <span className="text-sm text-neutral-400 dark:text-neutral-500">{activeModule}</span>
          </div>
          <button
            onClick={openSettings}
            className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-transform"
          >
            <Cog6ToothIcon className="w-6 h-6" />
          </button>
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
              {alltimeItems.map((t) => (
                <TemplateButton key={t.id} template={t} onClick={() => adapter.logFromTemplate(t)} />
              ))}

              {todayTopTwo.length > 0 && (
                <>
                  <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mt-1 px-1">Today</p>
                  {todayTopTwo.map(({ template }) => (
                    <TemplateButton key={template.id} template={template} onClick={() => adapter.logFromTemplate(template)} />
                  ))}
                </>
              )}

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
          onClose={() => setModal(null)}
          templates={templates}
          onLogged={() => setModal(null)}
        />
      ) : (
        <NewCaffeineModal
          open={modal === 'new'}
          onClose={() => setModal(null)}
          templates={templates}
          onLogged={() => setModal(null)}
        />
      )}
      {activeModule === 'alcohol' ? (
        <EnterAlcoholModal open={modal === 'enter'} onClose={() => setModal(null)} />
      ) : (
        <EnterCaffeineModal open={modal === 'enter'} onClose={() => setModal(null)} />
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
function NewAlcoholModal({ open, onClose, templates, onLogged }: {
  open: boolean; onClose: () => void; templates: TrackerTemplate[]; onLogged: () => void
}) {
  const createEntry = useCreateEntry()
  const [name, setName] = useState('')
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isDuplicate = templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isValid = name.trim().length > 0 && !isNaN(parseFloat(ml)) && !isNaN(parseFloat(abv))

  async function handleSubmit() {
    if (isDuplicate) { setError(`"${name.trim()}" already exists — use Other to log it`); return }
    const timestamp = ts.toISOString()
    for (let i = 0; i < count; i++) {
      await createEntry.mutateAsync({ custom_name: name.trim(), ml: parseFloat(ml), abv: parseFloat(abv), timestamp })
    }
    reset()
    onLogged()
  }
  function reset() { setName(''); setMl(''); setAbv(''); setError(null); setTs(new Date()); setCount(1) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Alcohol Drink">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        <Field label="Drink name">
          <input className={inputCls} placeholder="e.g. Lager, House Wine…" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="Amount (ml)">
          <input className={inputCls} inputMode="decimal" placeholder="330" value={ml} onChange={(e) => setMl(e.target.value)} />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls} inputMode="decimal" placeholder="5.0" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        <UnitPreview ml={ml} abv={abv} />
        <div className="flex gap-2">
          <Stepper value={count} onChange={setCount} />
          <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn + ' flex-1'}>Log</button>
        </div>
      </div>
    </Modal>
  )
}

// NewCaffeineModal — uses useCreateCaffeineEntry directly (module-specific modal)
export function NewCaffeineModal({ open, onClose, templates, onLogged }: {
  open: boolean; onClose: () => void; templates: TrackerTemplate[]; onLogged: () => void
}) {
  const createEntry = useCreateCaffeineEntry()
  const [name, setName] = useState('')
  const [mg, setMg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ts, setTs] = useState<Date>(() => new Date())
  const [count, setCount] = useState(1)

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isDuplicate = templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isValid = name.trim().length > 0 && !isNaN(parseFloat(mg))

  async function handleSubmit() {
    if (isDuplicate) { setError(`"${name.trim()}" already exists — use Other to log it`); return }
    const timestamp = ts.toISOString()
    for (let i = 0; i < count; i++) {
      await createEntry.mutateAsync({ custom_name: name.trim(), mg: parseFloat(mg), timestamp })
    }
    reset()
    onLogged()
  }
  function reset() { setName(''); setMg(''); setError(null); setTs(new Date()); setCount(1) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Caffeine Drink">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        <Field label="Drink name">
          <input className={inputCls} placeholder="e.g. Coffee, Energy Drink…" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="Caffeine (mg)">
          <input className={inputCls} inputMode="decimal" placeholder="80" value={mg} onChange={(e) => setMg(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Stepper value={count} onChange={setCount} />
          <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn + ' flex-1'}>Log</button>
        </div>
      </div>
    </Modal>
  )
}

function EnterAlcoholModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createEntry = useCreateEntry()
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isValid = !isNaN(parseFloat(ml)) && !isNaN(parseFloat(abv))

  function handleSubmit() {
    createEntry.mutate(
      { ml: parseFloat(ml), abv: parseFloat(abv), timestamp: ts.toISOString() },
      { onSuccess: () => { setMl(''); setAbv(''); setTs(new Date()); onClose() } },
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

export function EnterCaffeineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createEntry = useCreateCaffeineEntry()
  const [mg, setMg] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isValid = !isNaN(parseFloat(mg))

  function handleSubmit() {
    createEntry.mutate(
      { mg: parseFloat(mg), timestamp: ts.toISOString() },
      { onSuccess: () => { setMg(''); setTs(new Date()); onClose() } },
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
