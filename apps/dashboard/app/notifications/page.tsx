import type { Metadata } from 'next';
import { fetchNotifications, fetchSources } from '@/lib/api.server';
import { NotificationsClient } from '@/components/notifications/NotificationsClient';

export const metadata: Metadata = { title: 'Notification History — Web Crawler' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sourceId?: string }>;
}): Promise<React.JSX.Element> {
  const { sourceId } = await searchParams;
  const [logs, sources] = await Promise.all([
    fetchNotifications(sourceId ? { sourceId } : undefined),
    fetchSources(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Notification History</h1>
      <NotificationsClient initialLogs={logs} sources={sources} activeSourceId={sourceId} />
    </div>
  );
}
