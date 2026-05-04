import type { DataEntry } from '@/types/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface EntriesTableProps {
  entries: DataEntry[];
}

function formatPayloadPreview(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).slice(0, 3);
  return keys.map((k) => `${k}: ${String(payload[k]).slice(0, 30)}`).join(' | ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EntriesTable({ entries }: EntriesTableProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-muted-foreground text-sm">
        No entries found. Adjust filters or wait for new crawl data.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Category</TableHead>
          <TableHead className="w-[160px]">Entry Key</TableHead>
          <TableHead>Payload Preview</TableHead>
          <TableHead className="w-[160px]">Crawled At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              <Badge variant="secondary">{entry.category}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">
              {entry.entryKey ?? '—'}
            </TableCell>
            <TableCell className="max-w-[400px] truncate text-xs text-muted-foreground">
              {formatPayloadPreview(entry.payload)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {formatDate(entry.crawledAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
