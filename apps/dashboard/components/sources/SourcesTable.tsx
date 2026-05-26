'use client';

import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Source } from '@/types/api';
import { ACTIVE_INACTIVE_STYLES } from '@/lib/badge-styles';

type Row = Source & { _pending?: boolean };

export function SourcesTable({
  sources,
  onEdit,
  onDelete,
}: {
  sources: Row[];
  onEdit: (source: Source) => void;
  onDelete: (source: Source) => void;
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-muted-foreground">Name</TableHead>
            <TableHead className="text-muted-foreground">URL</TableHead>
            <TableHead className="text-muted-foreground">Category</TableHead>
            <TableHead className="text-muted-foreground">Interval (s)</TableHead>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => (
            <TableRow
              key={s.id}
              className={s._pending ? 'opacity-60' : 'hover:bg-muted/30'}
            >
              <TableCell className="font-semibold">
                <div className="flex items-center gap-2">
                  {s.displayName}
                  {s._pending && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Saving" />
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-[280px]">
                <span className="text-xs text-muted-foreground block overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.url}
                </span>
              </TableCell>
              <TableCell>{s.category}</TableCell>
              <TableCell>{s.crawlInterval}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={s.isActive ? ACTIVE_INACTIVE_STYLES.active : ACTIVE_INACTIVE_STYLES.inactive}
                >
                  {s.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit source"
                    disabled={s._pending}
                    onClick={() => onEdit(s)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete source"
                    disabled={s._pending}
                    onClick={() => onDelete(s)}
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
