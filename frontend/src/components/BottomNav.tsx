import {
  HomeIcon,
  ClipboardDocumentListIcon,
  BeakerIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  ClipboardDocumentListIcon as LogIconSolid,
  BeakerIcon as BeakerIconSolid,
  ChartBarIcon as ChartIconSolid,
} from '@heroicons/react/24/solid'
import Toast from './Toast'

export type Tab = 'home' | 'log' | 'manage' | 'data'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  toast?: string | null
  onDismissToast?: () => void
}

const tabs: { id: Tab; label: string; Icon: typeof HomeIcon; ActiveIcon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon, ActiveIcon: HomeIconSolid },
  { id: 'log', label: 'Log', Icon: ClipboardDocumentListIcon, ActiveIcon: LogIconSolid },
  { id: 'manage', label: 'Manage', Icon: BeakerIcon, ActiveIcon: BeakerIconSolid },
  { id: 'data', label: 'Data', Icon: ChartBarIcon, ActiveIcon: ChartIconSolid },
]

export default function BottomNav({ activeTab, onTabChange, toast, onDismissToast }: Props) {
  return (
    <nav data-dbg-zone="NAV" className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 pb-safe">
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 pointer-events-none">
        <Toast message={toast ?? null} onDismiss={onDismissToast ?? (() => {})} />
      </div>
      <div className="flex">
        {tabs.map(({ id, label, Icon, ActiveIcon }) => {
          const active = activeTab === id
          const Ic = active ? ActiveIcon : Icon
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors touch-manipulation ${
                active
                  ? 'text-blue-500'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <Ic className="w-6 h-6 overflow-visible" />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
