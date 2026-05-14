import { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'drinklog-admin-settings';

function loadTheme(): Theme {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s).theme ?? 'system') : 'system';
  } catch {
    return 'system';
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  useEffect(() => {
    const root = document.documentElement;
    let mql: MediaQueryList | null = null;
    let handler: (() => void) | null = null;

    function apply(t: Theme) {
      if (t === 'dark') {
        root.classList.add('dark');
      } else if (t === 'light') {
        root.classList.remove('dark');
      } else {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    }

    apply(theme);

    if (theme === 'system') {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      handler = () => apply('system');
      mql.addEventListener('change', handler);
    }

    return () => {
      if (mql && handler) mql.removeEventListener('change', handler);
    };
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const parsed = existing ? JSON.parse(existing) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, theme: t }));
    } catch {}
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
