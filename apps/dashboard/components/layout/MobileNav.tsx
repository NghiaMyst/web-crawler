'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NavLinks } from './NavLinks';

export function MobileNav(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-zinc-200 bg-zinc-100">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}>
          <Menu size={20} />
        </SheetTrigger>
        <SheetContent side="left" className="w-[260px] p-0 bg-zinc-100">
          <SheetHeader className="h-14 border-b border-zinc-200 px-5 flex justify-center">
            <SheetTitle className="text-base font-semibold">Web Crawler</SheetTitle>
          </SheetHeader>
          <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="font-semibold text-zinc-900">Web Crawler</span>
    </header>
  );
}
