import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottomNav, { type Tab } from './components/BottomNav'
import HomeTab from './tabs/HomeTab'
import LogTab from './tabs/LogTab'
import ManageTab from './tabs/ManageTab'
import DataTab from './tabs/DataTab'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 pb-16">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'log' && <LogTab />}
        {activeTab === 'manage' && <ManageTab />}
        {activeTab === 'data' && <DataTab />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </QueryClientProvider>
  )
}
