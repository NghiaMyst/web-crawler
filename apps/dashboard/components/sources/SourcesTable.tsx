'use client';

import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Source } from '@/types/api';

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
    <div className="rounded-md border border-zinc-200 bg-white overflow-x-auto">
      <Table>
        <TableHeader className="bg-zinc-100">
          <TableRow>
            <TableHead className="text-zinc-700">Name</TableHead>
            <TableHead className="text-zinc-700">URL</TableHead>
            <TableHead className="text-zinc-700">Category</TableHead>
            <TableHead className="text-zinc-700">Interval (s)</TableHead>
            <TableHead className="text-zinc-700">Status</TableHead>
            <TableHead className="text-zinc-700 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => (
            <TableRow
              key={s.id}
              className={s._pending ? 'opacity-60' : 'hover:bg-zinc-50'}
            >
              <TableCell className="font-semibold">
                <div className="flex items-center gap-2">
                  {s.displayName}
                  {s._pending && (
                    <Loader2 size={14} className="animate-spin text-zinc-500" aria-label="Saving" />
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-[280px]">
                <span className="text-xs text-zinc-500 block overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.url}
                </span>
              </TableCell>
              <TableCell>{s.category}</TableCell>
              <TableCell>{s.crawlInterval}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={s.isActive ? 'border-green-600 text-green-600' : 'border-red-500 text-red-500'}
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
