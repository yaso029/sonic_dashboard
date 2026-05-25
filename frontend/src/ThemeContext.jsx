import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/* Centralised light/dark theme state.
   - Source of truth is the `.dark` class on <html> (set pre-paint by the inline
     script in index.html to avoid a flash; mirrored here for React).
   - Persisted under `sonic-theme`; falls back to the OS preference. */

const STORAGE_KEY = 'sonic-theme';
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} });

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const setTheme = useCallback((t) => setThemeState(t === 'dark' ? 'dark' : 'light'), []);
  const toggleTheme = useCallback(() => setThemeState(t => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/* Reusable toggle button — drop into any header/sidebar. */
export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
      className={className}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
