import Modal from './Modal'
import { useSettings, type Theme, type ActiveModule } from '../contexts/SettingsContext'
import { apiFetch, clearAccessToken } from '../api/client'

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const MODULE_OPTIONS: { value: ActiveModule; label: string }[] = [
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'caffeine', label: 'Caffeine' },
]

export default function SettingsModal() {
  const { settings, updateSettings, isOpen, closeSettings, username, setUsername } = useSettings()

  return (
    <Modal open={isOpen} onClose={closeSettings} title="Settings">
      <div className="space-y-4">
        {username && (
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Logged in as</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{username}</span>
              <button
                onClick={async () => {
                  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
                  clearAccessToken()
                  setUsername(null)
                  closeSettings()
                }}
                className="text-sm text-red-500 font-medium"
              >
                Log out
              </button>
            </div>
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Tracking</p>
          <div className="flex rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
            {MODULE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateSettings({ activeModule: value })}
                className={`flex-1 py-2 text-sm font-medium transition-colors touch-manipulation ${
                  settings.activeModule === value
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
