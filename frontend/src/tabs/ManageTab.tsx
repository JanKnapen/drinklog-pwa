import { useState } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { Field, inputCls, primaryBtn } from '../components/FormFields'
import type { TrackerTemplate } from '../types'
import { useSettings } from '../contexts/SettingsContext'
import { useModuleAdapter } from '../hooks/useModuleAdapter'
import { useTemplates, useCreateTemplate, useUpdateTemplate } from '../api/templates'
import { useEntries } from '../api/entries'
import { useCaffeineTemplates, useCreateCaffeineTemplate, useUpdateCaffeineTemplate } from '../api/caffeine-templates'
import { useCaffeineEntries } from '../api/caffeine-entries'

export default function ManageTab() {
  const adapter = useModuleAdapter()
  const { openSettings } = useSettings()
  const { templates, activeModule } = adapter

  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<TrackerTemplate | null>(null)
  const [deleting, setDeleting] = useState<TrackerTemplate | null>(null)

  function handleDelete() {
    if (!deleting) return
    adapter.deleteTemplate(deleting.id).then(() => setDeleting(null))
  }

  const emptyMsg = activeModule === 'caffeine'
    ? 'No caffeine templates — tap + to add one'
    : 'No drink templates — tap + to add one'

  return (
    <div className="flex flex-col h-full">
      <div data-dbg-zone="HEADER" className="flex-shrink-0 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Manage</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowAdd(true)}
              className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-blue-500 active:scale-95 transition-transform">
              <PlusIcon className="w-5 h-5" />
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
        {templates.length === 0 ? (
          <EmptyState message={emptyMsg} />
        ) : (
          <div className="flex flex-col gap-2">
            {[...templates].sort((a, b) => b.usage_count - a.usage_count).map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{t.name}</p>
                  <p className="text-xs text-neutral-500 tabular-nums">
                    {t.displayInfo}
                    {t.entryCount > 0 && ` · ${t.entryCount} ${t.entryCount === 1 ? 'entry' : 'entries'}`}
                  </p>
                </div>
                <button onClick={() => setEditing(t)} className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors">
                  <PencilIcon className="w-4 h-4" />
                </button>
                {t.entryCount === 0 && (
                  <button onClick={() => setDeleting(t)} className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeModule === 'alcohol' ? (
        <>
          <EditAlcoholTemplate open={showAdd} templateId={undefined} onClose={() => setShowAdd(false)} />
          {editing && <EditAlcoholTemplate open templateId={editing.id} onClose={() => setEditing(null)} />}
        </>
      ) : (
        <>
          <EditCaffeineTemplate open={showAdd} templateId={undefined} onClose={() => setShowAdd(false)} />
          {editing && <EditCaffeineTemplate open templateId={editing.id} onClose={() => setEditing(null)} />}
        </>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleting(null)} />
          <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl p-5 mx-4 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Delete "{deleting.name}"?
            </h3>
            <p className="text-sm text-neutral-500 mb-4">This template will be permanently removed.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)}
                className="flex-1 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Self-contained alcohol template modal — fetches own data (adapter bypass allowed for edit modals)
function EditAlcoholTemplate({ open, templateId, onClose }: {
  open: boolean; templateId: string | undefined; onClose: () => void
}) {
  const { data: templates = [] } = useTemplates()
  const { data: entries = [] } = useEntries()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const template = templateId ? templates.find((t) => t.id === templateId) : undefined
  const pendingCustomNames = new Set(
    entries
      .filter((e) => e.template_id === null && !e.is_marked && e.custom_name !== null)
      .map((e) => e.custom_name!.toLowerCase())
  )

  const [name, setName] = useState(template?.name ?? '')
  const [ml, setMl] = useState(template ? String(template.default_ml) : '')
  const [abv, setAbv] = useState(template ? String(template.default_abv) : '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!template
  const mlAbvLocked = isEdit && template.confirmed_entry_count > 0
  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const isValid = name.trim().length > 0 && (mlAbvLocked || (!isNaN(mlNum) && !isNaN(abvNum)))

  function handleSave() {
    const trimmed = name.trim()
    const isDuplicate = templates.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.id !== template?.id)
    if (isDuplicate) { setError(`"${trimmed}" already exists`); return }
    if (pendingCustomNames.has(trimmed.toLowerCase())) {
      setError(`"${trimmed}" has an unconfirmed entry — confirm it first`)
      return
    }
    if (isEdit) {
      const data: Parameters<typeof updateTemplate.mutate>[0] = { id: template.id, name: trimmed }
      if (!mlAbvLocked) { data.default_ml = mlNum; data.default_abv = abvNum }
      updateTemplate.mutate(data, { onSuccess: () => { reset(); onClose() } })
    } else {
      createTemplate.mutate(
        { name: trimmed, default_ml: mlNum, default_abv: abvNum },
        { onSuccess: () => { reset(); onClose() } },
      )
    }
  }
  function reset() { setName(''); setMl(''); setAbv(''); setError(null) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title={isEdit ? 'Edit Template' : 'New Template'}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label={`Amount (ml)${mlAbvLocked ? ' — locked' : ''}`}>
          <input className={inputCls + (mlAbvLocked ? ' opacity-50 cursor-not-allowed' : '')}
            inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} disabled={mlAbvLocked} />
        </Field>
        <Field label={`ABV (%)${mlAbvLocked ? ' — locked' : ''}`}>
          <input className={inputCls + (mlAbvLocked ? ' opacity-50 cursor-not-allowed' : '')}
            inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} disabled={mlAbvLocked} />
        </Field>
        {mlAbvLocked && <p className="text-xs text-neutral-400">ml and ABV are locked because this template has confirmed entries.</p>}
        <button onClick={handleSave} disabled={!isValid} className={primaryBtn}>Save</button>
      </div>
    </Modal>
  )
}

export function EditCaffeineTemplate({ open, templateId, onClose }: {
  open: boolean; templateId: string | undefined; onClose: () => void
}) {
  const { data: templates = [] } = useCaffeineTemplates()
  const { data: entries = [] } = useCaffeineEntries()
  const createTemplate = useCreateCaffeineTemplate()
  const updateTemplate = useUpdateCaffeineTemplate()

  const template = templateId ? templates.find((t) => t.id === templateId) : undefined
  const pendingCustomNames = new Set(
    entries
      .filter((e) => e.template_id === null && !e.is_marked && e.custom_name !== null)
      .map((e) => e.custom_name!.toLowerCase())
  )

  const [name, setName] = useState(template?.name ?? '')
  const [mg, setMg] = useState(template ? String(template.default_mg) : '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!template
  const mgLocked = isEdit && template.confirmed_entry_count > 0
  const mgNum = parseFloat(mg)
  const isValid = name.trim().length > 0 && (mgLocked || !isNaN(mgNum))

  function handleSave() {
    const trimmed = name.trim()
    const isDuplicate = templates.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.id !== template?.id)
    if (isDuplicate) { setError(`"${trimmed}" already exists`); return }
    if (pendingCustomNames.has(trimmed.toLowerCase())) {
      setError(`"${trimmed}" has an unconfirmed entry — confirm it first`)
      return
    }
    if (isEdit) {
      const data: { id: string; name: string; default_mg?: number } = { id: template.id, name: trimmed }
      if (!mgLocked) data.default_mg = mgNum
      updateTemplate.mutate(data, { onSuccess: () => { reset(); onClose() } })
    } else {
      createTemplate.mutate(
        { name: trimmed, default_mg: mgNum },
        { onSuccess: () => { reset(); onClose() } },
      )
    }
  }
  function reset() { setName(''); setMg(''); setError(null) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title={isEdit ? 'Edit Template' : 'New Template'}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label={`Caffeine (mg)${mgLocked ? ' — locked' : ''}`}>
          <input className={inputCls + (mgLocked ? ' opacity-50 cursor-not-allowed' : '')}
            inputMode="decimal" value={mg} onChange={(e) => setMg(e.target.value)} disabled={mgLocked} />
        </Field>
        {mgLocked && <p className="text-xs text-neutral-400">Caffeine amount is locked because this template has confirmed entries.</p>}
        <button onClick={handleSave} disabled={!isValid} className={primaryBtn}>Save</button>
      </div>
    </Modal>
  )
}
