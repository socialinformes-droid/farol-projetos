'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'financeiro_theme';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'light';
    apply(saved);
    setTheme(saved);
  }, []);

  const apply = (t: Theme) => {
    const html = document.documentElement;
    if (t === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
  };

  const toggle = (t: Theme) => {
    apply(t);
    setTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  if (theme === null) {
    // Skeleton enquanto hidrata
    return <div className="h-7 w-full rounded-md bg-muted/40 animate-pulse" aria-hidden />;
  }

  return (
    <div className="flex items-center justify-between">
      <p className="eyebrow">Tema</p>
      <div className="flex gap-0.5 rounded-md bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => toggle('light')}
          className={cn(
            'inline-flex items-center justify-center h-6 w-7 rounded-sm transition-colors',
            theme === 'light'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="Modo claro"
          aria-pressed={theme === 'light'}
        >
          <Sun className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => toggle('dark')}
          className={cn(
            'inline-flex items-center justify-center h-6 w-7 rounded-sm transition-colors',
            theme === 'dark'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label="Modo escuro"
          aria-pressed={theme === 'dark'}
        >
          <Moon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
