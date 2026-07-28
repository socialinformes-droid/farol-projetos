'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHydrated } from '@/lib/use-hydrated';
import { ThemeToggle } from '@/components/layout/theme-toggle';

const COLLAPSE_STORAGE_KEY = 'farol:sidebar-collapsed';

type NavItem = { href: string; label: string; icon: typeof FolderKanban };

const NAV: NavItem[] = [
  { href: '/', label: 'Projetos', icon: FolderKanban },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

function readStoredCollapsed(): boolean {
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
}

export function Sidebar() {
  // A preferência de recolhido/expandido só existe no localStorage do
  // cliente. `useHydrated` garante que renderizamos o padrão (expandido) no
  // servidor e no primeiro render do cliente, evitando divergência de
  // hidratação; só depois lemos o valor real salvo.
  const hydrated = useHydrated();
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = hydrated && (override ?? readStoredCollapsed());

  function toggleCollapsed() {
    const next = !collapsed;
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
    setOverride(next);
  }

  return (
    <aside
      className={cn(
        'hidden md:flex shrink-0 sticky top-0 h-svh flex-col border-r border-rule/60 bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
    </aside>
  );
}

export function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  /** Rail só de ícones — usado apenas pela sidebar de desktop, nunca pela gaveta mobile. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Masthead — some quando recolhido, restaurado ao expandir */}
      {!collapsed && (
        <div className="border-b border-rule/40 px-5 pt-7 pb-5 shrink-0">
          <p className="eyebrow mb-1">Farol de</p>
          <h1 className="headline text-[28px] leading-none tracking-tight font-medium">
            Projetos
          </h1>
          <p className="mt-3 text-[11px] font-mono text-muted-foreground/80 lowercase first-letter:uppercase">
            {today}
          </p>
        </div>
      )}
      {collapsed && <div className="h-4 shrink-0" aria-hidden />}

      {/* Nav */}
      <nav className={cn('py-4 shrink-0', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && <p className="eyebrow px-2 mb-2">Seções</p>}
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-md py-2 text-sm transition-colors',
                    collapsed ? 'justify-center px-0' : 'px-2.5',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-foreground/75 hover:bg-sidebar-accent/50 hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {!collapsed && <span className="flex-1 leading-none">{item.label}</span>}
                  {!collapsed && active && <span className="text-primary text-[10px]">●</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Espaçador flexível */}
      <div className="flex-1 min-h-0" />

      {/* Footer */}
      <div className={cn('border-t border-rule/40 py-4 shrink-0', collapsed ? 'px-2' : 'px-5')}>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'flex items-center gap-2 rounded-md text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground',
              collapsed ? 'w-full justify-center py-2' : 'mb-3 w-full px-2 py-1.5',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
                <span>Recolher menu</span>
              </>
            )}
          </button>
        )}
        {!collapsed && <ThemeToggle />}
      </div>
    </div>
  );
}
