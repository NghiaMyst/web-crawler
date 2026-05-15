'use client';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { NotificationLog } from '@/types/api';

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
    <div className="rounded-md border border-zinc-200 bg-white overflow-x-auto">
      <Table>
        <TableHeader className="bg-zinc-100">
          <TableRow>
            <TableHead className="text-zinc-700">Status</TableHead>
            <TableHead className="text-zinc-700">Channel</TableHead>
            <TableHead className="text-zinc-700">Alert Rule</TableHead>
            <TableHead className="text-zinc-700">Message</TableHead>
            <TableHead className="text-zinc-700">Sent at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} className="hover:bg-zinc-50">
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    log.status === 'sent'
                      ? 'border-green-600 text-green-600'
                      : 'border-red-500 text-red-500'
                  }
                >
                  {log.status === 'sent' ? 'Sent' : 'Failed'}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    log.channel === 'telegram'
                      ? 'border-blue-500 text-blue-500'
                      : 'border-indigo-500 text-indigo-500'
                  }
                >
                  {log.channel === 'telegram' ? 'Telegram' : 'Discord'}
                </Badge>
              </TableCell>
              <TableCell className="font-semibold text-sm">
                <div>{log.alertRuleName}</div>
                <div className="text-xs text-zinc-500 font-normal">{log.sourceName}</div>
              </TableCell>
              <TableCell className="max-w-[360px]">
                <span className="text-xs text-zinc-600 block overflow-hidden text-ellipsis whitespace-nowrap">
                  {log.message}
                </span>
              </TableCell>
              <TableCell className="text-sm text-zinc-600 whitespace-nowrap">
                {formatDate(log.sentAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
