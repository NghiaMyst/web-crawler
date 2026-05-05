'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Settings2, ListTodo, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/entries', label: 'Entries', Icon: Database },
  { href: '/sources', label: 'Sources', Icon: Settings2 },
  { href: '/jobs',    label: 'Jobs',    Icon: ListTodo },
  { href: '/alerts',  label: 'Alerts',  Icon: Bell },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm min-h-[44px] transition-colors',
              isActive
                ? 'bg-zinc-900 text-white font-semibold'
                : 'text-zinc-700 hover:bg-zinc-200',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
