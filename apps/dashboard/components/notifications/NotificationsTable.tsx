'use client';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { NotificationLog } from '@/types/api';
import { NOTIF_STATUS_STYLES, CHANNEL_STYLES } from '@/lib/badge-styles';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function NotificationsTable({
  logs,
}: {
  logs: NotificationLog[];
}): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground">Channel</TableHead>
            <TableHead className="text-muted-foreground">Alert Rule</TableHead>
            <TableHead className="text-muted-foreground">Message</TableHead>
            <TableHead className="text-muted-foreground">Sent at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} className="hover:bg-muted/30">
              <TableCell>
                <Badge
                  variant="outline"
                  className={NOTIF_STATUS_STYLES[log.status]}
                >
                  {log.status === 'sent' ? 'Sent' : 'Failed'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={CHANNEL_STYLES[log.channel]}
                >
                  {log.channel === 'telegram' ? 'Telegram' : 'Discord'}
                </Badge>
              </TableCell>
              <TableCell className="font-semibold text-sm">
                <div>{log.alertRuleName}</div>
                <div className="text-xs text-muted-foreground font-normal">{log.sourceName}</div>
              </TableCell>
              <TableCell className="max-w-[360px]">
                <span className="text-xs text-muted-foreground block overflow-hidden text-ellipsis whitespace-nowrap">
                  {log.message}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(log.sentAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
