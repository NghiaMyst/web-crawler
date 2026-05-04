'use client';

import { useOptimistic, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SourcesTable } from './SourcesTable';
import { SourceModal } from './SourceModal';
import { DeleteSourceDialog } from './DeleteSourceDialog';
import { SourcesEmptyState } from './SourcesEmptyState';
import { deleteSourceAction } from '@/actions/source.actions';
import type { Source } from '@/types/api';

type OptimisticAction =
  | { type: 'add'; source: Source }
  | { type: 'delete'; id: string }
  | { type: 'replace'; sources: Source[] };

type RowSource = Source & { _pending?: boolean };

export function SourcesClient({
  initialSources,
}: {
  initialSources: Source[];
}): React.JSX.Element {
  const [baseSources, setBaseSources] = useState<Source[]>(initialSources);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [optimisticSources, dispatchOptimistic] = useOptimistic<RowSource[], OptimisticAction>(
    baseSources,
    (state, action) => {
      switch (action.type) {
        case 'add':
          return [...state, { ...action.source, _pending: true }];
        case 'delete':
          return state.filter((s) => s.id !== action.id);
        case 'replace':
          return action.sources;
      }
    },
  );

  function handleAdd(): void {
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(source: Source): void {
    setEditing(source);
    setModalOpen(true);
  }

  function handleDelete(source: Source): void {
    setDeleteTarget(source);
  }

  async function confirmDelete(source: Source): Promise<void> {
    dispatchOptimistic({ type: 'delete', id: source.id });
    const result = await deleteSourceAction(source.id);
    if (!result.ok) {
      // Rollback by restoring base list
      setBaseSources((prev) => (prev.some((s) => s.id === source.id) ? prev : [...prev, source]));
      setToast(result.error);
      return;
    }
    setBaseSources((prev) => prev.filter((s) => s.id !== source.id));
  }

  function handleSaveSuccess(saved: Source, mode: 'add' | 'edit'): void {
    if (mode === 'add') {
      // Optimistic append (revalidatePath in Server Action will reconcile on next nav)
      dispatchOptimistic({ type: 'add', source: saved });
      setBaseSources((prev) => [...prev, saved]);
    } else {
      setBaseSources((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-zinc-600">
          {optimisticSources.length} source{optimisticSources.length === 1 ? '' : 's'}
        </span>
        <Button onClick={handleAdd} variant="default">Add Source</Button>
      </div>

      {optimisticSources.length === 0 ? (
        <SourcesEmptyState onAdd={handleAdd} />
      ) : (
        <SourcesTable
          sources={optimisticSources}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <SourceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        source={editing}
        onSuccess={handleSaveSuccess}
      />

      <DeleteSourceDialog
        source={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-md shadow-lg" role="alert">
          {toast}
          <button onClick={() => setToast(null)} className="ml-3 font-semibold">×</button>
        </div>
      )}
    </div>
  );
}
