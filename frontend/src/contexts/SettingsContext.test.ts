import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSettings, saveSettings } from './SettingsContext'

const STORAGE_KEY = 'drinklog-settings'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  removeItem: (k: string) => { delete store[k] },
})

beforeEach(() => localStorage.clear())

describe('loadSettings', () => {
  it('returns default { theme: system, activeModule: alcohol, barcodeStrategy: 1 } when nothing is stored', () => {
    expect(loadSettings()).toEqual({ theme: 'system', activeModule: 'alcohol', barcodeStrategy: 1 })
  })

  it('returns stored settings merged with defaults when valid JSON is present', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }))
    expect(loadSettings()).toEqual({ theme: 'dark', activeModule: 'alcohol', barcodeStrategy: 1 })
  })

  it('returns default when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadSettings()).toEqual({ theme: 'system', activeModule: 'alcohol', barcodeStrategy: 1 })
  })
})

describe('saveSettings', () => {
  it('writes settings to localStorage as JSON', () => {
    saveSettings({ theme: 'light', activeModule: 'alcohol', barcodeStrategy: 1 })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ theme: 'light', activeModule: 'alcohol', barcodeStrategy: 1 }))
  })
})

describe('barcodeStrategy', () => {
  it('defaults to 1', () => {
    expect(loadSettings().barcodeStrategy).toBe(1)
  })

  it('persists through save/load', () => {
    const s = loadSettings()
    saveSettings({ ...s, barcodeStrategy: 3 })
    expect(loadSettings().barcodeStrategy).toBe(3)
  })

  it('falls back to 1 for unknown stored value', () => {
    localStorage.setItem('drinklog-settings', JSON.stringify({ barcodeStrategy: 99 }))
    expect(loadSettings().barcodeStrategy).toBe(1)
  })
})
