import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

interface ThemeContextValue {
  preference: ThemePreference;
  /** The theme actually shown right now. */
  resolved: 'light' | 'dark';
  density: Density;
  setPreference: (t: ThemePreference) => void;
  toggle: () => void;
  setDensity: (d: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const KEY = 'fl-theme';
const DKEY = 'fl-density';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    /* storage unavailable: fall back */
  }
  return fallback;
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Explicit light/dark sets data-theme on <html>. "system" removes it so prefers-color-scheme decides.
 * The inline script in index.html applies a stored choice before first paint.
 */
export function ThemeProvider({ children, defaultPreference = 'system' }: { children: ReactNode; defaultPreference?: ThemePreference }) {
  const [preference, setPref] = useState<ThemePreference>(() => read<ThemePreference>(KEY, ['light', 'dark', 'system'], defaultPreference));
  const [density, setDens] = useState<Density>(() => read<Density>(DKEY, ['comfortable', 'compact'], 'comfortable'));
  const [sys, setSys] = useState(systemDark);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }, [preference]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  const resolved: 'light' | 'dark' = preference === 'system' ? (sys ? 'dark' : 'light') : preference;
  const setPreference = useCallback((t: ThemePreference) => {
    setPref(t);
    write(KEY, t);
  }, []);
  const toggle = useCallback(() => setPreference(resolved === 'dark' ? 'light' : 'dark'), [resolved, setPreference]);
  const setDensity = useCallback((d: Density) => {
    setDens(d);
    write(DKEY, d);
  }, []);

  const value = useMemo(() => ({ preference, resolved, density, setPreference, toggle, setDensity }), [preference, resolved, density, setPreference, toggle, setDensity]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
