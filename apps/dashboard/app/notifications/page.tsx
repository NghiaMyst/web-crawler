import type { Metadata } from 'next';
import { fetchNotifications, fetchSources } from '@/lib/api.server';
import { NotificationsClient } from '@/components/notifications/NotificationsClient';
import { PageHeader } from '@/components/layout/PageHeader';

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
    <div>
      <PageHeader title="Notification History" description="Recent alert notifications sent for matched entries." />
      <NotificationsClient initialLogs={logs} sources={sources} activeSourceId={sourceId} />
    </div>
  );
}
