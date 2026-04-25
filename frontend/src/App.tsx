import { useState, lazy, Suspense, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottomNav, { type Tab } from './components/BottomNav'
import { SettingsProvider, useSettings } from './contexts/SettingsContext'
import SettingsModal from './components/SettingsModal'
import LoginView from './components/LoginView'
import { apiFetch, refreshAccessToken } from './api/client'

const HomeTab = lazy(() => import('./tabs/HomeTab'))
const LogTab = lazy(() => import('./tabs/LogTab'))
const ManageTab = lazy(() => import('./tabs/ManageTab'))
const DataTab = lazy(() => import('./tabs/DataTab'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

export default function App() {
  return (
    <SettingsProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
      <SettingsModal />
    </SettingsProvider>
  )
}

function AppContent() {
  const { setUsername, username } = useSettings()
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [toast, setToast] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      const ok = await refreshAccessToken()
      if (ok) {
        try {
          const me = await apiFetch<{ username: string }>('/api/auth/me')
          setUsername(me.username)
        } catch {
          // me failed after refresh — treat as logged out, username stays null
        }
      }
      setAuthChecked(true)
    })()
  }, [])

  if (!authChecked) {
    return <div className="fixed inset-0 bg-neutral-50 dark:bg-neutral-900" />
  }

  if (!username) {
    return <LoginView onLogin={(name) => setUsername(name)} />
  }

  return (
    <div className="fixed inset-0 bg-neutral-50 dark:bg-neutral-900 pt-safe pb-safe-nav flex flex-col">
      <Suspense fallback={<div className="flex-1" />}>
        {activeTab === 'home' && <HomeTab onToast={setToast} onScannerOpen={setScannerOpen} />}
        {activeTab === 'log' && <LogTab />}
        {activeTab === 'manage' && <ManageTab />}
        {activeTab === 'data' && <DataTab />}
      </Suspense>
      {!scannerOpen && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} toast={toast} onDismissToast={() => setToast(null)} />}
    </div>
  )
}
