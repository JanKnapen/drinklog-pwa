import { useState, useEffect } from 'react';
import { getToken, clearToken } from './api/client';
import LoginView from './views/LoginView';
import UsersView from './views/UsersView';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return <LoginView onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">DrinkLog Admin</h1>
        <button
          onClick={() => { clearToken(); setAuthed(false); }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Log out
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <UsersView />
      </main>
    </div>
  );
}
