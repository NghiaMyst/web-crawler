import type { DataEntry } from '@/types/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CategoryBadge } from '@/components/entries/CategoryBadge';

interface EntriesTableProps {
  entries: DataEntry[];
  q?: string;
}

/** Escape user-supplied q before inserting into a RegExp. Prevents ReDoS and unintended metacharacters. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Wrap case-insensitive literal matches of `q` in <mark>. Returns ReactNode (not string) when q is non-empty.
 * Safe: q is escaped via escapeRegExp; no HTML from server is injected.
 */
function highlightMatches(text: string, q: string | undefined): React.ReactNode {
  if (!q || q.trim() === '') return text;
  const escaped = escapeRegExp(q.trim());
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    part.toLowerCase() === q.trim().toLowerCase() ? (
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-800/50 rounded-sm px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function formatPayloadPreview(
  payload: Record<string, unknown>,
  q?: string,
): React.ReactNode {
  const keys = Object.keys(payload).slice(0, 3);
  const text = keys
    .map((k) => `${k}: ${String(payload[k]).slice(0, 30)}`)
    .join(' | ');
  return highlightMatches(text, q);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EntriesTable({ entries, q }: EntriesTableProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-muted-foreground text-sm">
        {q && q.trim() !== ''
          ? `No results for "${q.trim()}". Try a different search term or clear filters.`
          : 'No entries found. Adjust filters or wait for new crawl data.'}
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
              <CategoryBadge category={entry.category} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">
              {entry.entryKey ?? '—'}
            </TableCell>
            <TableCell className="max-w-[400px] truncate text-xs text-muted-foreground">
              {formatPayloadPreview(entry.payload, q)}
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
