import { useState, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottomNav, { type Tab } from './components/BottomNav'

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
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} toast={toast} onDismissToast={() => setToast(null)} />
    </QueryClientProvider>
  )
}
