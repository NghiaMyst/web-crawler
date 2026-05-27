'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Settings2, ListTodo, Bell, History, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/entries',       label: 'Entries',       Icon: Database   },
  { href: '/sources',       label: 'Sources',       Icon: Settings2  },
  { href: '/jobs',          label: 'Jobs',          Icon: ListTodo   },
  { href: '/alerts',        label: 'Alerts',        Icon: Bell       },
  { href: '/notifications', label: 'Notifications', Icon: History    },
  { href: '/charts',        label: 'Charts',        Icon: BarChart2  },
] as const;

export function NavLinks({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-3">
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
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )}
          >
            <Icon size={16} aria-hidden="true" className={isActive ? 'text-primary-foreground' : 'text-sidebar-foreground/50'} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
