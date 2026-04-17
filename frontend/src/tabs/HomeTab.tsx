import { useState, useEffect } from 'react'
import {
  PlusCircleIcon,
  BeakerIcon,
  ListBulletIcon,
} from '@heroicons/react/24/solid'
import { useTemplates, useUpdateTemplate } from '../api/templates'
import { useCreateEntry } from '../api/entries'
import Modal from '../components/Modal'
import TimestampPicker from '../components/TimestampPicker'
import { standardUnits } from '../utils'
import type { DrinkTemplate } from '../types'

export default function HomeTab({ onToast }: { onToast: (msg: string) => void }) {
  const { data: templates = [] } = useTemplates()
  const createEntry = useCreateEntry()
  const updateTemplate = useUpdateTemplate()

  const [modal, setModal] = useState<'new' | 'enter-ml' | 'other' | null>(null)

  const topFive = [...templates].sort((a, b) => b.usage_count - a.usage_count).slice(0, 5)

  function logFromTemplate(template: DrinkTemplate) {
    createEntry.mutate(
      {
        template_id: template.id,
        ml: template.default_ml,
        abv: template.default_abv,
        timestamp: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          updateTemplate.mutate({ id: template.id, usage_count: template.usage_count + 1 })
          onToast(`Logged: ${template.name}`)
          setModal(null)
        },
      },
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 pt-6 pb-3">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">DrinkLog</h1>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
      <div className="flex flex-col gap-2 mb-6">
        <ActionCard
          title="New"
          subtitle="Create a new drink type"
          icon={<PlusCircleIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('new')}
        />
        <ActionCard
          title="Enter ml"
          subtitle="Quick amount, no name"
          icon={<BeakerIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('enter-ml')}
        />
        <ActionCard
          title="Other"
          subtitle="Pick from your drinks"
          icon={<ListBulletIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('other')}
        />
      </div>

      {topFive.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">
            Quick Log
          </p>
          <div className="flex flex-col gap-2">
            {topFive.map((t) => (
              <button
                key={t.id}
                onClick={() => logFromTemplate(t)}
                className="w-full flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t.name}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {t.default_ml}ml · {t.default_abv.toFixed(1)}% · {standardUnits(t.default_ml, t.default_abv).toFixed(1)} units
                  </p>
                </div>
                <span className="text-neutral-400 text-sm">&rsaquo;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      </div>

      <NewDrinkModal
        open={modal === 'new'}
        onClose={() => setModal(null)}
        templates={templates}
        onLogged={() => setModal(null)}
      />
      <EnterMlModal open={modal === 'enter-ml'} onClose={() => setModal(null)} />
      <OtherModal
        open={modal === 'other'}
        onClose={() => setModal(null)}
        templates={templates}
        onLogged={(name) => { onToast(`Logged: ${name}`); setModal(null) }}
      />
    </div>
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

const inputCls = 'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-base text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
const primaryBtn = 'w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</label>
      {children}
    </div>
  )
}

function UnitPreview({ ml, abv }: { ml: string; abv: string }) {
  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  if (isNaN(mlNum) || isNaN(abvNum)) return null
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
      Standard units: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{standardUnits(mlNum, abvNum).toFixed(1)}</span>
    </p>
  )
}

function NewDrinkModal({ open, onClose, templates, onLogged }: {
  open: boolean; onClose: () => void; templates: DrinkTemplate[]; onLogged: () => void
}) {
  const createEntry = useCreateEntry()
  const [name, setName] = useState('')
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const isDuplicate = templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isValid = name.trim().length > 0 && !isNaN(parseFloat(ml)) && !isNaN(parseFloat(abv))

  function handleSubmit() {
    if (isDuplicate) { setError(`"${name.trim()}" already exists — use Other to log it`); return }
    createEntry.mutate(
      { custom_name: name.trim(), ml: parseFloat(ml), abv: parseFloat(abv), timestamp: ts.toISOString() },
      { onSuccess: () => { reset(); onLogged() } },
    )
  }
  function reset() { setName(''); setMl(''); setAbv(''); setError(null); setTs(new Date()) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Drink">
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
        <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn}>Log</button>
      </div>
    </Modal>
  )
}

function EnterMlModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

function OtherModal({ open, onClose, templates, onLogged }: {
  open: boolean; onClose: () => void; templates: DrinkTemplate[]; onLogged: (name: string) => void
}) {
  const createEntry = useCreateEntry()
  const updateTemplate = useUpdateTemplate()
  const [search, setSearch] = useState('')
  const [ts, setTs] = useState<Date>(() => new Date())

  useEffect(() => { if (open) setTs(new Date()) }, [open])

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  function logTemplate(t: DrinkTemplate) {
    createEntry.mutate(
      { template_id: t.id, ml: t.default_ml, abv: t.default_abv, timestamp: ts.toISOString() },
      {
        onSuccess: () => {
          updateTemplate.mutate({ id: t.id, usage_count: t.usage_count + 1 })
          setSearch('')
          setTs(new Date())
          onLogged(t.name)
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={() => { setSearch(''); setTs(new Date()); onClose() }} title="Other Drinks">
      <div className="flex flex-col gap-2">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        <input className={inputCls} placeholder="Search drinks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {filtered.length === 0 && <p className="text-sm text-neutral-400 py-4 text-center">No drinks found</p>}
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {filtered.map((t) => (
            <button key={t.id} onClick={() => logTemplate(t)}
              className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 active:scale-[0.98] transition-transform text-left">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t.name}</p>
                <p className="text-xs text-neutral-500 tabular-nums">
                  {t.default_ml}ml · {t.default_abv.toFixed(1)}% · {standardUnits(t.default_ml, t.default_abv).toFixed(1)} units
                </p>
              </div>
              <span className="text-blue-500 text-lg">+</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
