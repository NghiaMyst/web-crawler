import { cn } from '@/lib/utils';

const CATEGORY_STYLES: Record<string, string> = {
  football: 'bg-sky-100 text-sky-700 border-sky-200',
  manga:    'bg-orange-100 text-orange-700 border-orange-200',
  anime:    'bg-violet-100 text-violet-700 border-violet-200',
  games:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  music:    'bg-pink-100 text-pink-700 border-pink-200',
};

const DEFAULT_STYLE = 'bg-zinc-100 text-zinc-600 border-zinc-200';

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps): React.JSX.Element {
  const style = CATEGORY_STYLES[category.toLowerCase()] ?? DEFAULT_STYLE;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        style,
        className,
      )}
    >
      {category}
    </span>
  );
}
