'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NavLinks } from './NavLinks';
import { ConnectionDot } from '@/components/connection/connection-dot';
import { SearchInput } from '@/components/search/SearchInput';

export function MobileNav(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-zinc-200 bg-sidebar">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" className="text-zinc-300 hover:text-white hover:bg-white/10" />}>
          <Menu size={20} />
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0 bg-sidebar">
          <SheetHeader className="h-14 border-b border-sidebar-border px-5 flex justify-center">
            <SheetTitle className="text-base font-bold tracking-tight">
              <span className="text-sidebar-foreground">web</span>
              <span className="text-primary">crawler</span>
            </SheetTitle>
          </SheetHeader>
              <div className="px-3 py-2.5 border-b border-sidebar-border">
                <SearchInput />
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="inline-flex items-center gap-1.5">
        <span className="font-bold tracking-tight">
          <span className="text-sidebar-foreground">web</span>
          <span className="text-primary">crawler</span>
        </span>
        <ConnectionDot />
      </div>
    </header>
  );
}
