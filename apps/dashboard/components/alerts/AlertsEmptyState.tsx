import { Button } from '@/components/ui/button';

export function AlertsEmptyState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <h2 className="text-xl font-semibold text-zinc-900">No alert rules configured</h2>
      <p className="text-sm text-zinc-600 max-w-md">
        Add your first alert rule to start receiving notifications when monitored data changes.
      </p>
      <Button onClick={onAdd} variant="default">Add Alert Rule</Button>
    </div>
  );
}
