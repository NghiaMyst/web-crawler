'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { Trophy, BookOpen, Sparkles, Gamepad2, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  {
    id: 'football',
    label: 'Football',
    Icon: Trophy,
    colorInactive: 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100',
    colorActive: 'bg-primary border-primary text-primary-foreground',
  },
  {
    id: 'manga',
    label: 'Manga',
    Icon: BookOpen,
    colorInactive: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
    colorActive: 'bg-primary border-primary text-primary-foreground',
  },
  {
    id: 'anime',
    label: 'Anime',
    Icon: Sparkles,
    colorInactive: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100',
    colorActive: 'bg-primary border-primary text-primary-foreground',
  },
  {
    id: 'games',
    label: 'Games',
    Icon: Gamepad2,
    colorInactive: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
    colorActive: 'bg-primary border-primary text-primary-foreground',
  },
  {
    id: 'music',
    label: 'Music',
    Icon: Music2,
    colorInactive: 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100',
    colorActive: 'bg-primary border-primary text-primary-foreground',
  },
] as const;

export function CategoryFilterTiles(): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentCategory = searchParams.get('category') ?? '';

  const handleClick = (catId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cursor');

    // Toggle: clicking the active category clears it
    if (params.get('category') === catId) {
      params.delete('category');
    } else {
      params.set('category', catId);
    }

    const target = `/entries${params.toString() ? `?${params.toString()}` : ''}`;
    startTransition(() => {
      router.push(target);
    });

    void pathname;
  };

  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Filter by category">
      {CATEGORIES.map(({ id, label, Icon, colorInactive, colorActive }) => {
        const isActive = currentCategory === id;
        return (
          <button
            key={id}
            type="button"
            disabled={isPending}
            onClick={() => handleClick(id)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              isActive ? colorActive : colorInactive,
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
