import { useTheme } from '../contexts/ThemeContext';

type Theme = 'light' | 'dark' | 'system';

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsDialog({ onClose, onLogout }: Props) {
  const { theme, setTheme } = useTheme();

  const themes: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            Appearance
          </p>
          <div className="flex gap-2">
            {themes.map(t => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  theme === t.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
          <button
            onClick={onLogout}
            className="w-full text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
