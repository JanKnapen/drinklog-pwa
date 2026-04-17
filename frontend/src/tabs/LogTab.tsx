import { useState } from 'react'
import { TrashIcon, PencilIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useEntries, useDeleteEntry, useConfirmAll, useUpdateEntry } from '../api/entries'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import TimestampPicker from '../components/TimestampPicker'
import { groupByDate, localMidnightISO, todayKey, standardUnits } from '../utils'
import type { DrinkEntry } from '../types'

export default function LogTab() {
  const { data: entries = [] } = useEntries()
  const deleteEntry = useDeleteEntry()
  const confirmAll = useConfirmAll()

  const [filter, setFilter] = useState<'unconfirmed' | 'confirmed'>('unconfirmed')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set([todayKey()]))
  const [editingEntry, setEditingEntry] = useState<DrinkEntry | null>(null)

  const filtered = entries.filter((e) => e.is_marked === (filter === 'confirmed'))
  const groups = groupByDate(filtered)
  const today = todayKey()

  const hasEligibleToConfirm = entries
    .filter((e) => !e.is_marked)
    .some((e) => {
      const d = new Date(e.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return key < today
    })

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3 bg-neutral-50 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Log</h1>
      </div>

      <div data-dbg-zone="LIST" className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        {filtered.length === 0 ? (
          <EmptyState message={filter === 'confirmed' ? 'No confirmed entries' : 'No unconfirmed entries'} />
        ) : (
          <div className="px-4 flex flex-col gap-2 pt-2 pb-4">
            {groups.map(({ date, entries: dayEntries }) => {
              const isExpanded = expandedDates.has(date)
              const totalUnits = dayEntries.reduce((s, e) => s + e.standard_units, 0)
              const label = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'short',
              })
              return (
                <div key={date}>
                  <button onClick={() => toggleDate(date)} className="w-full flex justify-between items-center py-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 tabular-nums">{totalUnits.toFixed(1)} units</span>
                      <span className="text-neutral-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="flex flex-col gap-1">
                      {dayEntries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          isConfirmed={filter === 'confirmed'}
                          onEdit={() => setEditingEntry(entry)}
                          onDelete={() => deleteEntry.mutate(entry.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div data-dbg-zone="FOOTER" className="flex-shrink-0 px-4 pt-3 pb-3 flex flex-col gap-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
        {filter === 'unconfirmed' && (
          <button
            onClick={() => confirmAll.mutate(localMidnightISO())}
            disabled={!hasEligibleToConfirm || confirmAll.isPending}
            className="flex items-center justify-center gap-2 bg-blue-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white disabled:text-neutral-400 font-semibold text-sm py-2.5 rounded-full transition-colors"
          >
            <CheckCircleIcon className="w-5 h-5" />
            Confirm All
          </button>
        )}
        <div className="flex rounded-xl border border-neutral-200 dark:border-neutral-700">
          {(['unconfirmed', 'confirmed'] as const).map((f, i) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${i === 0 ? 'rounded-l-xl' : 'rounded-r-xl'} ${
                filter === f ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {editingEntry && <EditEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} />}
    </div>
  )
}

function EntryRow({ entry, isConfirmed, onEdit, onDelete }: {
  entry: DrinkEntry; isConfirmed: boolean; onEdit: () => void; onDelete: () => void
}) {
  const displayName = entry.template?.name ?? entry.custom_name
  const canEdit = !isConfirmed
  const time = new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 rounded-xl px-3 py-2.5">
      <div className="flex-1 min-w-0">
        {displayName && (
          <p className={`text-sm font-medium truncate ${entry.template_id === null ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
            {displayName}
          </p>
        )}
        <p className="text-xs text-neutral-500 tabular-nums">{entry.ml}ml · {entry.abv.toFixed(1)}% · {time}</p>
      </div>
      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
        {entry.standard_units.toFixed(1)}<span className="text-xs font-normal text-neutral-400 ml-0.5">u</span>
      </span>
      {!isConfirmed && (
        <>
          {canEdit && (
            <button onClick={onEdit} className="p-1 text-neutral-400 hover:text-blue-500 transition-colors">
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-neutral-400 hover:text-red-500 transition-colors">
            <TrashIcon className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}

function EditEntryModal({ entry, onClose }: { entry: DrinkEntry; onClose: () => void }) {
  const updateEntry = useUpdateEntry()
  const isTemplateEntry = entry.template_id !== null
  const hasName = entry.custom_name !== null
  const [name, setName] = useState(entry.custom_name ?? '')
  const [ml, setMl] = useState(String(entry.ml))
  const [abv, setAbv] = useState(String(entry.abv))
  const [ts, setTs] = useState<Date>(() => new Date(entry.timestamp))

  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const isValid = isTemplateEntry || (!isNaN(mlNum) && !isNaN(abvNum) && (!hasName || name.trim().length > 0))

  function handleSave() {
    const data: Parameters<typeof updateEntry.mutate>[0] = {
      id: entry.id,
      timestamp: ts.toISOString(),
    }
    if (!isTemplateEntry) {
      data.ml = mlNum
      data.abv = abvNum
      if (hasName) data.custom_name = name.trim()
    }
    updateEntry.mutate(data, { onSuccess: onClose })
  }

  return (
    <Modal open onClose={onClose} title="Edit Entry">
      <div className="flex flex-col gap-3">
        <Field label="When (month · day · hour)">
          <TimestampPicker value={ts} onChange={setTs} />
        </Field>
        {!isTemplateEntry && (
          <>
            {hasName && (
              <Field label="Name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Amount (ml)">
              <input className={inputCls} inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} />
            </Field>
            <Field label="ABV (%)">
              <input className={inputCls} inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} />
            </Field>
            <UnitPreview ml={ml} abv={abv} />
          </>
        )}
        <button onClick={handleSave} disabled={!isValid || updateEntry.isPending} className={primaryBtn}>Save</button>
      </div>
    </Modal>
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
