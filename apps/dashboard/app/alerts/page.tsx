import type { Metadata } from 'next';
import type { AlertRule, Source } from '@/types/api';
import { fetchAlertRules, fetchSources } from '@/lib/api.server';
import { AlertsClient } from '@/components/alerts/AlertsClient';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Alert Rules — Web Crawler' };
export const dynamic = 'force-dynamic';

export default async function AlertsPage(): Promise<React.JSX.Element> {
  let rules: AlertRule[] = [];
  let sources: Source[] = [];
  try {
    [rules, sources] = await Promise.all([fetchAlertRules(), fetchSources()]);
  } catch {
    return (
      <div>
        <PageHeader title="Alert Rules" description="Get notified when crawl conditions are met." />
        <p className="text-sm text-red-600">Could not load alert rules. Please try again later.</p>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="Alert Rules" description="Get notified when crawl conditions are met." />
      <AlertsClient initialRules={rules} sources={sources} />
    </div>
  );
}
