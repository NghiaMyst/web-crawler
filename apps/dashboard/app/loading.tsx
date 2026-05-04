import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';

export default function Loading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-32 bg-zinc-200" />
      <TableSkeleton />
    </div>
  );
}
