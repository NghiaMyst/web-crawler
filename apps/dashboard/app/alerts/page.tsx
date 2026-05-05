import type { Metadata } from 'next';
import { fetchAlertRules, fetchSources } from '@/lib/api.server';
import { AlertsClient } from '@/components/alerts/AlertsClient';

export const metadata: Metadata = { title: 'Alert Rules — Web Crawler' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage(): Promise<React.JSX.Element> {
  const [rules, sources] = await Promise.all([fetchAlertRules(), fetchSources()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Alert Rules</h1>
      <AlertsClient initialRules={rules} sources={sources} />
    </div>
  );
}
