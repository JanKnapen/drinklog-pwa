import { useState, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottomNav, { type Tab } from './components/BottomNav'
import Toast from './components/Toast'

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
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [toast, setToast] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="fixed inset-0 bg-neutral-50 dark:bg-neutral-900 pt-safe pb-safe-nav overflow-hidden flex flex-col">
        <Suspense fallback={<div className="flex-1" />}>
          {activeTab === 'home' && <HomeTab onToast={setToast} />}
          {activeTab === 'log' && <LogTab />}
          {activeTab === 'manage' && <ManageTab />}
          {activeTab === 'data' && <DataTab />}
        </Suspense>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="relative">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 pointer-events-auto">
            <Toast message={toast} onDismiss={() => setToast(null)} />
          </div>
        </div>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </QueryClientProvider>
  )
}
