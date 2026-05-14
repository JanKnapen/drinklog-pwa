import { useState, useEffect } from 'react';
import { getToken, clearToken } from './api/client';
import { ThemeProvider } from './contexts/ThemeContext';
import AdminHeader from './components/AdminHeader';
import LoginView from './views/LoginView';
import UsersView from './views/UsersView';

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return (
      <ThemeProvider>
        <LoginView onLogin={() => setAuthed(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <AdminHeader onLogout={() => { clearToken(); setAuthed(false); }} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <UsersView />
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
