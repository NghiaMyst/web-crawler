'use client';

import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCondition } from '@/lib/alert-rules';
import type { AlertRule, Source } from '@/types/api';
import { ALERT_CONDITION_STYLES, CHANNEL_STYLES, ACTIVE_INACTIVE_STYLES } from '@/lib/badge-styles';

type Row = AlertRule & { _pending?: boolean };

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
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-muted-foreground">Name</TableHead>
            <TableHead className="text-muted-foreground">Source</TableHead>
            <TableHead className="text-muted-foreground">Condition</TableHead>
            <TableHead className="text-muted-foreground">Channel</TableHead>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow
              key={r.id}
              className={r._pending ? 'opacity-60' : 'hover:bg-muted/30'}
            >
              <TableCell className="font-semibold">
                <div className="flex items-center gap-2">
                  {r.name}
                  {r._pending && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Saving" />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {sources.find((s) => s.id === r.sourceId)?.displayName ?? r.sourceId}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={ALERT_CONDITION_STYLES[r.condition.type]}>
                  {formatCondition(r.condition)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={CHANNEL_STYLES[r.channel]}>
                  {r.channel === 'telegram' ? 'Telegram' : 'Discord'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={r.isActive ? ACTIVE_INACTIVE_STYLES.active : ACTIVE_INACTIVE_STYLES.inactive}
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
