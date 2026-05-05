'use client';

import { useTransition } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AlertRule } from '@/types/api';

export function DeleteAlertDialog({
  rule,
  open,
  onOpenChange,
  onConfirm,
}: {
  rule: AlertRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rule: AlertRule) => Promise<void>;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete alert rule?</DialogTitle>
          <DialogDescription>
            This will permanently remove the alert rule and stop future notifications. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Keep rule
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || !rule}
            onClick={() => {
              if (!rule) return;
              startTransition(async () => {
                await onConfirm(rule);
                onOpenChange(false);
              });
            }}
          >
            {isPending ? 'Deleting…' : 'Delete Alert Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
