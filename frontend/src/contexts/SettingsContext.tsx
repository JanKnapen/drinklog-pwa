import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ActiveModule = 'alcohol' | 'caffeine'
export type BarcodeStrategy = 1 | 2 | 3

export interface Settings {
  theme: Theme
  activeModule: ActiveModule
  barcodeStrategy: BarcodeStrategy
}

interface SettingsContextValue {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  openSettings: () => void
  closeSettings: () => void
  isOpen: boolean
}

const STORAGE_KEY = 'drinklog-settings'
const DEFAULT_SETTINGS: Settings = { theme: 'system', activeModule: 'alcohol', barcodeStrategy: 1 }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    if (![1, 2, 3].includes(parsed.barcodeStrategy)) parsed.barcodeStrategy = 1
    return parsed
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'dark') {
      root.classList.add('dark')
      return
    }
    if (settings.theme === 'light') {
      root.classList.remove('dark')
      return
    }
    // system: follow OS and listen for changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.matches ? root.classList.add('dark') : root.classList.remove('dark')
    const handler = (e: MediaQueryListEvent) => {
      e.matches ? root.classList.add('dark') : root.classList.remove('dark')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings.theme])

  function updateSettings(patch: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      openSettings: () => setIsOpen(true),
      closeSettings: () => setIsOpen(false),
      isOpen,
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
