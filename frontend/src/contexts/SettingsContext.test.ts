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
  it('returns default { theme: system } when nothing is stored', () => {
    expect(loadSettings()).toEqual({ theme: 'system' })
  })

  it('returns stored settings when valid JSON is present', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }))
    expect(loadSettings()).toEqual({ theme: 'dark' })
  })

  it('returns default when localStorage contains invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    expect(loadSettings()).toEqual({ theme: 'system' })
  })
})

describe('saveSettings', () => {
  it('writes settings to localStorage as JSON', () => {
    saveSettings({ theme: 'light' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ theme: 'light' }))
  })
})
