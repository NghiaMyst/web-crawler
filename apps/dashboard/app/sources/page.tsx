import type { Metadata } from 'next';
import { fetchSources } from '@/lib/api.server';
import { SourcesClient } from '@/components/sources/SourcesClient';

export const metadata: Metadata = {
  title: 'Sources — Web Crawler',
};

export const dynamic = 'force-dynamic';

export default async function SourcesPage(): Promise<React.JSX.Element> {
  const sources = await fetchSources();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Sources</h1>
      <SourcesClient initialSources={sources} />
    </div>
  );
}
