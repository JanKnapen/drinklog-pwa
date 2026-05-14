import { useState, useEffect } from 'react';
import { getToken, clearToken } from './api/client';
import LoginView from './views/LoginView';
import UsersView from './views/UsersView';
import ImportReviewView from './views/ImportReviewView';

const isReviewTab = window.location.pathname === '/import-review';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return <LoginView onLogin={() => setAuthed(true)} />;
  }

  if (isReviewTab) return <ImportReviewView />;

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">DrinkLog Admin</h1>
        <button
          onClick={() => { clearToken(); setAuthed(false); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Log out
        </button>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <UsersView />
        </div>
      </main>
    </div>
  );
}
