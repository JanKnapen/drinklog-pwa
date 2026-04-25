import { useMemo } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '../api/templates'
import { useEntries, useCreateEntry, useDeleteEntry, useUpdateEntry, useConfirmAll } from '../api/entries'
import {
  useCaffeineTemplates,
  useCreateCaffeineTemplate,
  useUpdateCaffeineTemplate,
  useDeleteCaffeineTemplate,
} from '../api/caffeine-templates'
import {
  useCaffeineEntries,
  useCreateCaffeineEntry,
  useDeleteCaffeineEntry,
  useUpdateCaffeineEntry,
  useConfirmAllCaffeineEntries,
} from '../api/caffeine-entries'
import { standardUnits, caffeineUnits } from '../utils'
import { useAppConfig } from '../api/config'
import type { TrackerTemplate, TrackerEntry } from '../types'

export interface ModuleAdapter {
  templates: TrackerTemplate[]
  entries: TrackerEntry[]
  isEntriesFetched: boolean
  activeModule: 'alcohol' | 'caffeine'
  moduleTitle: string
  logFromTemplate: (t: TrackerTemplate) => void
  logFromTemplateWithOptions: (t: TrackerTemplate, count: number, timestamp: string) => Promise<void>
  logFromPendingEntry: (e: TrackerEntry, count: number, timestamp: string) => Promise<void>
  confirmAll: (cutoff: Date) => Promise<void>
  deleteEntry: (id: string) => void
  updateEntryTimestamp: (id: string, ts: Date) => void
  createTemplate: (payload: Record<string, unknown>) => Promise<void>
  updateTemplate: (id: string, payload: Record<string, unknown>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
}

export function useModuleAdapter(): ModuleAdapter {
  const { settings } = useSettings()
  const activeModule = settings.activeModule
  const config = useAppConfig()

  // All hooks called unconditionally (React rules)
  const { data: drinkTemplates = [] } = useTemplates()
  const { data: drinkEntries = [], isFetched: drinkEntriesFetched } = useEntries({ limit: 100 })
  const createDrinkEntry = useCreateEntry()
  const updateDrinkTemplate = useUpdateTemplate()
  const deleteDrinkEntry = useDeleteEntry()
  const updateDrinkEntry = useUpdateEntry()
  const confirmAllDrink = useConfirmAll()
  const createDrinkTemplate = useCreateTemplate()
  const deleteDrinkTemplate = useDeleteTemplate()

  const { data: caffeineTemplates = [] } = useCaffeineTemplates()
  const { data: caffeineEntries = [], isFetched: caffeineEntriesFetched } = useCaffeineEntries({ limit: 100 })
  const createCaffeineEntry = useCreateCaffeineEntry()
  const updateCaffeineTemplate = useUpdateCaffeineTemplate()
  const deleteCaffeineEntry = useDeleteCaffeineEntry()
  const updateCaffeineEntry = useUpdateCaffeineEntry()
  const confirmAllCaffeine = useConfirmAllCaffeineEntries()
  const createCaffeineTemplate = useCreateCaffeineTemplate()
  const deleteCaffeineTemplate = useDeleteCaffeineTemplate()

  // Memoize mapped arrays so consumers only see a new reference when underlying data changes,
  // not on every render (avoids spurious effect triggers in HomeTab snapshot logic)
  const alcoholTemplatesMapped = useMemo((): TrackerTemplate[] => drinkTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    usage_count: t.usage_count,
    entryCount: t.entry_count,
    confirmedEntryCount: t.confirmed_entry_count,
    displayInfo: `${t.default_ml}ml · ${t.default_abv.toFixed(1)}% · ${standardUnits(t.default_ml, t.default_abv, config.alcohol_unit_divisor).toFixed(1)}u`,
  })), [drinkTemplates, config.alcohol_unit_divisor])

  const alcoholEntriesMapped = useMemo((): TrackerEntry[] => drinkEntries.map((e) => ({
    id: e.id,
    templateId: e.template_id,
    customName: e.custom_name,
    name: e.template?.name ?? e.custom_name,
    timestamp: e.timestamp,
    isMarked: e.is_marked,
    value: e.standard_units,
    displayInfo: `${e.ml}ml · ${e.abv.toFixed(1)}% · ${e.standard_units.toFixed(1)} units`,
  })), [drinkEntries])

  const caffeineTemplatesMapped = useMemo((): TrackerTemplate[] => caffeineTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    usage_count: t.usage_count,
    entryCount: t.entry_count,
    confirmedEntryCount: t.confirmed_entry_count,
    displayInfo: `${t.default_mg}mg · ${caffeineUnits(t.default_mg, config.caffeine_unit_divisor).toFixed(1)}u`,
  })), [caffeineTemplates, config.caffeine_unit_divisor])

  const caffeineEntriesMapped = useMemo((): TrackerEntry[] => caffeineEntries.map((e) => ({
    id: e.id,
    templateId: e.template_id,
    customName: e.custom_name,
    name: e.template?.name ?? e.custom_name,
    timestamp: e.timestamp,
    isMarked: e.is_marked,
    value: e.caffeine_units,
    displayInfo: `${e.mg}mg · ${e.caffeine_units.toFixed(1)} units`,
  })), [caffeineEntries])

  if (activeModule === 'caffeine') {
    return {
      templates: caffeineTemplatesMapped,
      entries: caffeineEntriesMapped,
      isEntriesFetched: caffeineEntriesFetched,
      activeModule: 'caffeine',
      moduleTitle: 'CaffeineLog',
      logFromTemplate: (t) => {
        const raw = caffeineTemplates.find((r) => r.id === t.id)!
        createCaffeineEntry.mutate(
          { template_id: raw.id, mg: raw.default_mg, timestamp: new Date().toISOString() },
          { onSuccess: () => updateCaffeineTemplate.mutate({ id: raw.id, usage_count: raw.usage_count + 1 }) },
        )
      },
      logFromTemplateWithOptions: async (t, count, timestamp) => {
        const raw = caffeineTemplates.find((r) => r.id === t.id)!
        for (let i = 0; i < count; i++) {
          await createCaffeineEntry.mutateAsync({ template_id: raw.id, mg: raw.default_mg, timestamp })
        }
        updateCaffeineTemplate.mutate({ id: raw.id, usage_count: raw.usage_count + count })
      },
      logFromPendingEntry: async (e, count, timestamp) => {
        const raw = caffeineEntries.find((r) => r.id === e.id)!
        for (let i = 0; i < count; i++) {
          await createCaffeineEntry.mutateAsync({ custom_name: raw.custom_name!, mg: raw.mg, timestamp })
        }
      },
      confirmAll: (cutoff) => confirmAllCaffeine.mutateAsync(cutoff.toISOString()).then(() => {}),
      deleteEntry: (id) => deleteCaffeineEntry.mutate(id),
      updateEntryTimestamp: (id, ts) => updateCaffeineEntry.mutate({ id, timestamp: ts.toISOString() }),
      createTemplate: (payload) =>
        createCaffeineTemplate.mutateAsync(payload as Parameters<typeof createCaffeineTemplate.mutateAsync>[0]).then(() => {}),
      updateTemplate: (id, payload) =>
        updateCaffeineTemplate.mutateAsync({
          id,
          ...(payload as Omit<Parameters<typeof updateCaffeineTemplate.mutateAsync>[0], 'id'>),
        }).then(() => {}),
      deleteTemplate: (id) => deleteCaffeineTemplate.mutateAsync(id).then(() => {}),
    }
  }

  // Alcohol (default)
  return {
    templates: alcoholTemplatesMapped,
    entries: alcoholEntriesMapped,
    isEntriesFetched: drinkEntriesFetched,
    activeModule: 'alcohol',
    moduleTitle: 'DrinkLog',
    logFromTemplate: (t) => {
      const raw = drinkTemplates.find((r) => r.id === t.id)!
      createDrinkEntry.mutate(
        { template_id: raw.id, ml: raw.default_ml, abv: raw.default_abv, timestamp: new Date().toISOString() },
        { onSuccess: () => updateDrinkTemplate.mutate({ id: raw.id, usage_count: raw.usage_count + 1 }) },
      )
    },
    logFromTemplateWithOptions: async (t, count, timestamp) => {
      const raw = drinkTemplates.find((r) => r.id === t.id)!
      for (let i = 0; i < count; i++) {
        await createDrinkEntry.mutateAsync({ template_id: raw.id, ml: raw.default_ml, abv: raw.default_abv, timestamp })
      }
      updateDrinkTemplate.mutate({ id: raw.id, usage_count: raw.usage_count + count })
    },
    logFromPendingEntry: async (e, count, timestamp) => {
      const raw = drinkEntries.find((r) => r.id === e.id)!
      for (let i = 0; i < count; i++) {
        await createDrinkEntry.mutateAsync({ custom_name: raw.custom_name!, ml: raw.ml, abv: raw.abv, timestamp })
      }
    },
    confirmAll: (cutoff) => confirmAllDrink.mutateAsync(cutoff.toISOString()).then(() => {}),
    deleteEntry: (id) => deleteDrinkEntry.mutate(id),
    updateEntryTimestamp: (id, ts) => updateDrinkEntry.mutate({ id, timestamp: ts.toISOString() }),
    createTemplate: (payload) =>
      createDrinkTemplate.mutateAsync(payload as Parameters<typeof createDrinkTemplate.mutateAsync>[0]).then(() => {}),
    updateTemplate: (id, payload) =>
      updateDrinkTemplate.mutateAsync({
        id,
        ...(payload as Omit<Parameters<typeof updateDrinkTemplate.mutateAsync>[0], 'id'>),
      }).then(() => {}),
    deleteTemplate: (id) => deleteDrinkTemplate.mutateAsync(id).then(() => {}),
  }
}
