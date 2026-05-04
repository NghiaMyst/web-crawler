import { Button } from '@/components/ui/button';

export function SourcesEmptyState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <h2 className="text-xl font-semibold text-zinc-900">No sources configured</h2>
      <p className="text-sm text-zinc-600 max-w-md">
        Add your first crawl source to start monitoring data.
      </p>
      <Button onClick={onAdd} variant="default">Add Source</Button>
    </div>
  );
}
