import { useState, useEffect, useMemo } from 'react'
import { TrashIcon, PencilIcon, CheckCircleIcon, Cog6ToothIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import TimestampPicker from '../components/TimestampPicker'
import { Field, UnitPreview, DecimalField, inputCls, primaryBtn } from '../components/FormFields'
import { groupByDate, localMidnightISO, todayKey, toLocalDateKey } from '../utils'
import type { TrackerEntry, DrinkEntry, CaffeineEntry } from '../types'
import { useSettings } from '../contexts/SettingsContext'
import { useEntries, useDeleteEntry, useConfirmAll, useUpdateEntry } from '../api/entries'
import { useTemplates } from '../api/templates'
import {
  useCaffeineEntries,
  useDeleteCaffeineEntry,
  useConfirmAllCaffeineEntries,
  useUpdateCaffeineEntry,
} from '../api/caffeine-entries'
import { useCaffeineTemplates } from '../api/caffeine-templates'
import { apiFetch } from '../api/client'
import { removeMutation } from '../api/offline-queue'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { usePendingAlcoholEntries, usePendingCaffeineEntries, isPendingId, PENDING_ID_PREFIX } from '../hooks/usePendingEntries'

function mapEntry(e: DrinkEntry | CaffeineEntry, activeModule: 'alcohol' | 'caffeine'): TrackerEntry {
  if (activeModule === 'alcohol') {
    const d = e as DrinkEntry
    return {
      id: d.id,
      templateId: d.template_id,
      customName: d.custom_name,
      name: d.template?.name ?? d.custom_name,
      timestamp: d.timestamp,
      isMarked: d.is_marked,
      value: d.standard_units,
      displayInfo: `${d.ml}ml · ${d.abv.toFixed(1)}% · ${d.standard_units.toFixed(1)} units`,
      isPending: isPendingId(d.id),
    }
  }
  const c = e as CaffeineEntry
  return {
    id: c.id,
    templateId: c.template_id,
    customName: c.custom_name,
    name: c.template?.name ?? c.custom_name,
    timestamp: c.timestamp,
    isMarked: c.is_marked,
    value: c.caffeine_units,
    displayInfo: `${c.mg}mg · ${c.caffeine_units.toFixed(1)} units`,
    isPending: isPendingId(c.id),
  }
}

export default function LogTab() {
  const { settings, openSettings } = useSettings()
  const activeModule = settings.activeModule

  // Both called unconditionally (React rules)
  const alcoholQuery = useEntries()
  const caffeineQuery = useCaffeineEntries()
  const query = activeModule === 'alcohol' ? alcoholQuery : caffeineQuery
  const serverEntries = query.data ?? []

  // Both called unconditionally (React rules)
  const deleteAlcohol = useDeleteEntry()
  const deleteCaffeine = useDeleteCaffeineEntry()
  const confirmAllAlcohol = useConfirmAll()
  const confirmAllCaffeine = useConfirmAllCaffeineEntries()
  const isOnline = useOnlineStatus()

  // Pending (offline-queued) entries are hydrated from IndexedDB and prepended so
  // they appear at the top of the unconfirmed list — same source the adapter uses.
  const { data: drinkTemplates = [] } = useTemplates()
  const { data: caffeineTemplatesData = [] } = useCaffeineTemplates()
  const pendingAlcohol = usePendingAlcoholEntries(drinkTemplates)
  const pendingCaffeine = usePendingCaffeineEntries(caffeineTemplatesData)
  const rawEntries = useMemo(() => {
    if (activeModule === 'alcohol') return [...pendingAlcohol, ...(serverEntries as DrinkEntry[])]
    return [...pendingCaffeine, ...(serverEntries as CaffeineEntry[])]
  }, [activeModule, pendingAlcohol, pendingCaffeine, serverEntries])

  const [filter, setFilter] = useState<'unconfirmed' | 'confirmed'>('unconfirmed')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set([todayKey()]))
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  // Load more state
  const [extraConfirmed, setExtraConfirmed] = useState<typeof rawEntries>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreExhausted, setLoadMoreExhausted] = useState(false)
  const [nextOffset, setNextOffset] = useState(100)

  // Reset load-more state when activeModule changes
  useEffect(() => {
    setExtraConfirmed([])
    setLoadMoreExhausted(false)
    setNextOffset(100)
  }, [activeModule])

  const allMapped: TrackerEntry[] = useMemo(
    () => rawEntries.map(e => mapEntry(e, activeModule)),
    [rawEntries, activeModule]
  )
  const allUnconfirmed = allMapped.filter((e) => !e.isMarked)
  const confirmedFromInitial = allMapped.filter((e) => e.isMarked)
  const extraMapped = useMemo(
    () => extraConfirmed.map(e => mapEntry(e, activeModule)),
    [extraConfirmed, activeModule]
  )
  const allConfirmed = [...confirmedFromInitial, ...extraMapped]

  // Derive canLoadMore: show "Load more" only if we might have more data on server
  const canLoadMore = !loadMoreExhausted && (confirmedFromInitial.length >= 100 || extraConfirmed.length > 0)

  const displayed = filter === 'confirmed' ? allConfirmed : allUnconfirmed
  const groups = groupByDate(displayed)
  const today = todayKey()

  // Pending entries haven't reached the server, so Confirm All can't affect them.
  const hasEligibleToConfirm = allUnconfirmed.some((e) => !e.isPending && toLocalDateKey(e.timestamp) < today)

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  function handleDelete(id: string) {
    if (isPendingId(id)) {
      removeMutation(id.slice(PENDING_ID_PREFIX.length)).catch(() => {})
      return
    }
    if (activeModule === 'alcohol') deleteAlcohol.mutate(id)
    else deleteCaffeine.mutate(id)
  }

  function handleEdit(id: string) {
    if (isPendingId(id)) return
    setEditingEntryId(id)
  }

  async function handleConfirmAll(cutoff: Date) {
    const iso = cutoff.toISOString()
    if (activeModule === 'alcohol') await confirmAllAlcohol.mutateAsync(iso)
    else await confirmAllCaffeine.mutateAsync(iso)
    setExtraConfirmed([])
    setLoadMoreExhausted(false)
    setNextOffset(100)
  }

  // Offset starts at 100 because the initial useEntries() call already fetches
  // the most-recent 100 confirmed entries (same result as confirmed_only=true&offset=0)
  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const path = activeModule === 'alcohol' ? '/api/alcohol-entries' : '/api/caffeine-entries'
      const more = await apiFetch<typeof rawEntries>(
        `${path}?confirmed_only=true&limit=100&offset=${nextOffset}`
      )
      if (more.length < 100) setLoadMoreExhausted(true)
      setExtraConfirmed((prev) => [...prev, ...more] as typeof rawEntries)
      setNextOffset((prev) => prev + 100)
    } finally {
      setLoadingMore(false)
    }
  }

  const midnight = new Date(localMidnightISO())

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Log</h1>
          <button
            onClick={openSettings}
            className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-transform"
          >
            <Cog6ToothIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div data-dbg-zone="LIST" className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        {displayed.length === 0 ? (
          <EmptyState message={filter === 'confirmed' ? 'No confirmed entries' : 'No unconfirmed entries'} />
        ) : (
          <div className="px-4 flex flex-col gap-2 pt-2 pb-4">
            {groups.map(({ date, entries: dayEntries }, idx) => {
              const isExpanded = expandedDates.has(date)
              const totalValue = dayEntries.reduce((s, e) => s + e.value, 0)
              const year = date.slice(0, 4)
              const prevYear = idx > 0 ? groups[idx - 1].date.slice(0, 4) : null
              const showYearHeader = year !== prevYear
              const label = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'short',
              })
              return (
                <div key={date}>
                  {showYearHeader && (
                    <div className="py-1 mt-1 mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{year}</span>
                    </div>
                  )}
                  <button onClick={() => toggleDate(date)} className="w-full flex justify-between items-center py-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 tabular-nums">{totalValue.toFixed(1)} units</span>
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
                          onEdit={() => handleEdit(entry.id)}
                          onDelete={() => handleDelete(entry.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {filter === 'confirmed' && canLoadMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm font-medium text-blue-500 disabled:text-neutral-400 transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>

      <div data-dbg-zone="FOOTER" className="flex-shrink-0 px-4 pt-3 pb-3 flex flex-col gap-2 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
        {filter === 'unconfirmed' && (
          <button
            onClick={() => handleConfirmAll(midnight)}
            disabled={!hasEligibleToConfirm || !isOnline}
            title={!isOnline ? 'Confirm All requires an internet connection' : undefined}
            className="flex items-center justify-center gap-2 bg-blue-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white disabled:text-neutral-400 font-semibold text-sm py-2.5 rounded-full transition-colors"
          >
            <CheckCircleIcon className="w-5 h-5" />
            {isOnline ? 'Confirm All' : 'Confirm All (offline)'}
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

      {editingEntryId && activeModule === 'alcohol' && (
        <EditAlcoholEntry entryId={editingEntryId} onClose={() => setEditingEntryId(null)} />
      )}
      {editingEntryId && activeModule === 'caffeine' && (
        <EditCaffeineEntry entryId={editingEntryId} onClose={() => setEditingEntryId(null)} />
      )}
    </div>
  )
}

function EntryRow({ entry, isConfirmed, onEdit, onDelete }: {
  entry: TrackerEntry; isConfirmed: boolean; onEdit: () => void; onDelete: () => void
}) {
  const time = new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const bg = entry.isPending
    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40'
    : 'bg-white dark:bg-neutral-800'

  return (
    <div className={`flex items-center gap-2 ${bg} rounded-xl px-3 py-2.5`}>
      <div className="flex-1 min-w-0">
        {entry.name && (
          <p className={`text-sm font-medium truncate ${entry.templateId === null ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
            {entry.name}
          </p>
        )}
        <p className="text-xs text-neutral-500 tabular-nums flex items-center gap-1.5">
          <span>{entry.displayInfo} · {time}</span>
          {entry.isPending && (
            <ArrowPathIcon className="w-3 h-3 text-amber-700 dark:text-amber-300 animate-spin" aria-label="Pending sync" />
          )}
        </p>
      </div>
      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
        {entry.value.toFixed(1)}<span className="text-xs font-normal text-neutral-400 ml-0.5">u</span>
      </span>
      {!isConfirmed && (
        <>
          <button
            onClick={onEdit}
            disabled={entry.isPending}
            className="p-1 text-neutral-400 hover:text-blue-500 disabled:hover:text-neutral-300 disabled:opacity-40 transition-colors"
            title={entry.isPending ? 'Edit available after sync' : undefined}
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1 text-neutral-400 hover:text-red-500 transition-colors">
            <TrashIcon className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}

// Edit modals fetch their own raw data by ID (adapter bypass explicitly allowed for edit modals)

function EditAlcoholEntry({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data: entries = [] } = useEntries()
  const entry = entries.find((e) => e.id === entryId)
  if (!entry) return null
  return <EditAlcoholEntryForm entry={entry} onClose={onClose} />
}

function EditAlcoholEntryForm({ entry, onClose }: { entry: DrinkEntry; onClose: () => void }) {
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
    const data: Parameters<typeof updateEntry.mutate>[0] = { id: entry.id, timestamp: ts.toISOString() }
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
            <DecimalField label="Amount (ml)" value={ml} onChange={setMl} />
            <DecimalField label="ABV (%)" value={abv} onChange={setAbv} />
            <UnitPreview ml={ml} abv={abv} />
          </>
        )}
        <button onClick={handleSave} disabled={!isValid || updateEntry.isPending} className={primaryBtn}>Save</button>
      </div>
    </Modal>
  )
}

export function EditCaffeineEntry({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data: entries = [] } = useCaffeineEntries()
  const entry = entries.find((e) => e.id === entryId)
  if (!entry) return null
  return <EditCaffeineEntryForm entry={entry} onClose={onClose} />
}

function EditCaffeineEntryForm({ entry, onClose }: { entry: CaffeineEntry; onClose: () => void }) {
  const updateEntry = useUpdateCaffeineEntry()
  const isTemplateEntry = entry.template_id !== null
  const hasName = entry.custom_name !== null
  const [name, setName] = useState(entry.custom_name ?? '')
  const [mg, setMg] = useState(String(entry.mg))
  const [ts, setTs] = useState<Date>(() => new Date(entry.timestamp))

  const mgNum = parseFloat(mg)
  const isValid = isTemplateEntry || (!isNaN(mgNum) && (!hasName || name.trim().length > 0))

  function handleSave() {
    const data: Parameters<typeof updateEntry.mutate>[0] = { id: entry.id, timestamp: ts.toISOString() }
    if (!isTemplateEntry) {
      data.mg = mgNum
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
            <DecimalField label="Caffeine (mg)" value={mg} onChange={setMg} />
          </>
        )}
        <button onClick={handleSave} disabled={!isValid || updateEntry.isPending} className={primaryBtn}>Save</button>
      </div>
    </Modal>
  )
}
