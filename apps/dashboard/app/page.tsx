import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Web Crawler Dashboard</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Monitor crawled data from all your configured sources.
      </p>
      <div className="flex gap-3">
        <Link href="/entries" className={cn(buttonVariants({ variant: 'default' }))}>
          View Entries
        </Link>
      </div>
    </main>
  );
}
