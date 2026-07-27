'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarContent } from './sidebar';

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-rule/40 bg-paper-dark/40 backdrop-blur sticky top-0 z-30">
      <div>
        <p className="eyebrow">Farol de</p>
        <h1 className="headline text-lg leading-none italic font-light text-foreground/85">
          Projetos
        </h1>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" />}>
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 overflow-y-auto" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
