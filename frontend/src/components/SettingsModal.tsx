import Modal from './Modal'
import { useSettings, type Theme } from '../contexts/SettingsContext'

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export default function SettingsModal() {
  const { settings, updateSettings, isOpen, closeSettings } = useSettings()

  return (
    <Modal open={isOpen} onClose={closeSettings} title="Settings">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Appearance</p>
          <div className="flex rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
            {THEME_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateSettings({ theme: value })}
                className={`flex-1 py-2 text-sm font-medium transition-colors touch-manipulation ${
                  settings.theme === value
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
