'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/lib/use-hydrated';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // O tema só é conhecido no cliente. Renderizar o estado real antes da
  // hidratação causaria divergência com o HTML do servidor.
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="h-7 w-full rounded-md bg-muted/40 animate-pulse" aria-hidden />;
  }

  return (
    <div className="flex items-center justify-between">
      <p className="eyebrow">Tema</p>
      <div className="flex gap-0.5 rounded-md bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setTheme('light')}
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
          onClick={() => setTheme('dark')}
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
