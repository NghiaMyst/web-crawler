'use client';

import { useTransition } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Source } from '@/types/api';

export function DeleteSourceDialog({
  source,
  open,
  onOpenChange,
  onConfirm,
}: {
  source: Source | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (source: Source) => Promise<void>;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete source?</DialogTitle>
          <DialogDescription>
            This will permanently remove the source and stop future crawls. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || !source}
            onClick={() => {
              if (!source) return;
              startTransition(async () => {
                await onConfirm(source);
                onOpenChange(false);
              });
            }}
          >
            {isPending ? 'Deleting…' : 'Delete source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
