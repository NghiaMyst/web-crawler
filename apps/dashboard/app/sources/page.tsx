import type { Metadata } from 'next';
import { fetchSources } from '@/lib/api.server';
import { SourcesClient } from '@/components/sources/SourcesClient';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata: Metadata = {
  title: 'Sources — Web Crawler',
};

export const dynamic = 'force-dynamic';

export default async function SourcesPage(): Promise<React.JSX.Element> {
  const sources = await fetchSources();
  return (
    <div>
      <PageHeader title="Sources" description="Manage the URLs and domains the crawler monitors." />
      <SourcesClient initialSources={sources} />
    </div>
  );
}
