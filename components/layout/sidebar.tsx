'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/theme-toggle';

type NavItem = { href: string; label: string; icon: typeof FolderKanban };

const NAV: NavItem[] = [
  { href: '/', label: 'Projetos', icon: FolderKanban },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 sticky top-0 h-svh flex-col border-r border-rule/60 bg-sidebar text-sidebar-foreground">
      <SidebarContent />
    </aside>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Masthead */}
      <div className="px-5 pt-7 pb-5 border-b border-rule/40 shrink-0">
        <p className="eyebrow mb-1">Farol de</p>
        <h1 className="headline text-[28px] leading-none tracking-tight font-medium">
          Projetos
        </h1>
        <p className="mt-3 text-[11px] font-mono text-muted-foreground/80 lowercase first-letter:uppercase">
          {today}
        </p>
      </div>

      {/* Nav */}
      <nav className="px-3 py-4 shrink-0">
        <p className="eyebrow px-2 mb-2">Seções</p>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  className={cn(
                    'group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-foreground/75 hover:bg-sidebar-accent/50 hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="flex-1 leading-none">{item.label}</span>
                  {active && <span className="text-primary text-[10px]">●</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Espaçador flexível */}
      <div className="flex-1 min-h-0" />

      {/* Footer */}
      <div className="px-5 py-4 border-t border-rule/40 shrink-0">
        <ThemeToggle />
      </div>
    </div>
  );
}
