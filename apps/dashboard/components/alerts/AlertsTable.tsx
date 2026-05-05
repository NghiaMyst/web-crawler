'use client';

import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCondition } from '@/lib/alert-rules';
import type { AlertRule, Source } from '@/types/api';

type Row = AlertRule & { _pending?: boolean };

function conditionBadgeClass(type: AlertRule['condition']['type']): string {
  switch (type) {
    case 'new_item':
      return 'border-zinc-400 text-zinc-600';
    case 'field_changed':
      return 'border-blue-500 text-blue-500';
    case 'threshold':
      return 'border-amber-500 text-amber-600';
  }
}

function channelBadgeClass(channel: AlertRule['channel']): string {
  return channel === 'telegram'
    ? 'border-blue-500 text-blue-500'
    : 'border-indigo-500 text-indigo-500';
}

export function AlertsTable({
  rules,
  sources,
  onEdit,
  onDelete,
}: {
  rules: Row[];
  sources: Source[];
  onEdit: (rule: AlertRule) => void;
  onDelete: (rule: AlertRule) => void;
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-zinc-200 bg-white overflow-x-auto">
      <Table>
        <TableHeader className="bg-zinc-100">
          <TableRow>
            <TableHead className="text-zinc-700">Name</TableHead>
            <TableHead className="text-zinc-700">Source</TableHead>
            <TableHead className="text-zinc-700">Condition</TableHead>
            <TableHead className="text-zinc-700">Channel</TableHead>
            <TableHead className="text-zinc-700">Status</TableHead>
            <TableHead className="text-zinc-700 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow
              key={r.id}
              className={r._pending ? 'opacity-60' : 'hover:bg-zinc-50'}
            >
              <TableCell className="font-semibold">
                <div className="flex items-center gap-2">
                  {r.name}
                  {r._pending && (
                    <Loader2 size={14} className="animate-spin text-zinc-500" aria-label="Saving" />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {sources.find((s) => s.id === r.sourceId)?.displayName ?? r.sourceId}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={conditionBadgeClass(r.condition.type)}>
                  {formatCondition(r.condition)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={channelBadgeClass(r.channel)}>
                  {r.channel === 'telegram' ? 'Telegram' : 'Discord'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={r.isActive ? 'border-green-600 text-green-600' : 'border-red-500 text-red-500'}
                >
                  {r.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit alert rule"
                    disabled={r._pending}
                    onClick={() => onEdit(r)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete alert rule"
                    disabled={r._pending}
                    onClick={() => onDelete(r)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
