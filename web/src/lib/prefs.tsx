import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Dir = 'ltr' | 'rtl';
export type Lang = 'en' | 'he';

interface Prefs { dir: Dir; lang: Lang }
interface Ctx extends Prefs {
  setDir: (d: Dir) => void;
  setLang: (l: Lang) => void;
}

const KEY = 'reservist.prefs';
const defaults: Prefs = { dir: 'ltr', lang: 'en' };

const Context = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    document.documentElement.setAttribute('dir', prefs.dir);
    document.documentElement.setAttribute('lang', prefs.lang);
  }, [prefs]);

  return (
    <Context.Provider value={{
      ...prefs,
      setDir: (d) => setPrefs((p) => ({ ...p, dir: d })),
      setLang: (l) => setPrefs((p) => ({ ...p, lang: l })),
    }}>
      {children}
    </Context.Provider>
  );
}

export function usePrefs(): Ctx {
  const v = useContext(Context);
  if (!v) throw new Error('usePrefs outside PrefsProvider');
  return v;
}
