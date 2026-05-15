'use client';

import { useOptimistic, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertsTable } from './AlertsTable';
import { AlertRuleModal } from './AlertRuleModal';
import { DeleteAlertDialog } from './DeleteAlertDialog';
import { AlertsEmptyState } from './AlertsEmptyState';
import { deleteAlertRuleAction } from '@/actions/alert-rule.actions';
import type { AlertRule, Source } from '@/types/api';

type OptimisticAction =
  | { type: 'add'; rule: AlertRule }
  | { type: 'delete'; id: string }
  | { type: 'replace'; rules: AlertRule[] };

type RowRule = AlertRule & { _pending?: boolean };

export function AlertsClient({
  initialRules,
  sources,
}: {
  initialRules: AlertRule[];
  sources: Source[];
}): React.JSX.Element {
  const [baseRules, setBaseRules] = useState<AlertRule[]>(initialRules);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [optimisticRules, dispatchOptimistic] = useOptimistic<RowRule[], OptimisticAction>(
    baseRules,
    (state, action) => {
      switch (action.type) {
        case 'add':
          return [...state, { ...action.rule, _pending: true }];
        case 'delete':
          return state.filter((r) => r.id !== action.id);
        case 'replace':
          return action.rules;
      }
    },
  );

  function handleAdd(): void {
    setEditing(null);
    setModalOpen(true);
  }

  function handleEdit(rule: AlertRule): void {
    setEditing(rule);
    setModalOpen(true);
  }

  function handleDelete(rule: AlertRule): void {
    setDeleteTarget(rule);
  }

  async function confirmDelete(rule: AlertRule): Promise<void> {
    dispatchOptimistic({ type: 'delete', id: rule.id });
    const result = await deleteAlertRuleAction(rule.id);
    if (!result.ok) {
      setBaseRules((prev) => (prev.some((r) => r.id === rule.id) ? prev : [...prev, rule]));
      setToast(result.error);
      // Keep deleteTarget set so the dialog stays open — user can retry or cancel manually.
      setDeleteTarget(rule);
      return;
    }
    setDeleteTarget(null);
    setBaseRules((prev) => prev.filter((r) => r.id !== rule.id));
  }

  function handleSaveSuccess(saved: AlertRule, mode: 'add' | 'edit'): void {
    if (mode === 'add') {
      setBaseRules((prev) => [...prev, saved]);
    } else {
      setBaseRules((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-zinc-600">
          {optimisticRules.length} rule{optimisticRules.length === 1 ? '' : 's'}
        </span>
        <Button onClick={handleAdd} variant="default">Add Alert Rule</Button>
      </div>

      {optimisticRules.length === 0 ? (
        <AlertsEmptyState onAdd={handleAdd} />
      ) : (
        <AlertsTable
          rules={optimisticRules}
          sources={sources}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      <AlertRuleModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        rule={editing}
        sources={sources}
        onSuccess={handleSaveSuccess}
      />

      <DeleteAlertDialog
        rule={deleteTarget}
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
