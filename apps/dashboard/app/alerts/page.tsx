import type { Metadata } from 'next';
import type { AlertRule, Source } from '@/types/api';
import { fetchAlertRules, fetchSources } from '@/lib/api.server';
import { AlertsClient } from '@/components/alerts/AlertsClient';

export const metadata: Metadata = { title: 'Alert Rules — Web Crawler' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage(): Promise<React.JSX.Element> {
  let rules: AlertRule[] = [];
  let sources: Source[] = [];
  try {
    [rules, sources] = await Promise.all([fetchAlertRules(), fetchSources()]);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900">Alert Rules</h1>
        <p className="text-sm text-red-600">Could not load alert rules. Please try again later.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Alert Rules</h1>
      <AlertsClient initialRules={rules} sources={sources} />
    </div>
  );
}
