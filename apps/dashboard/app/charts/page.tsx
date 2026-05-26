import type { Metadata } from 'next';
import { fetchSources, fetchVolumeStats } from '@/lib/api.server';
import { VolumeChart } from '@/components/charts/VolumeChart';
import { PageHeader } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Entry Volume — Web Crawler' };
export const dynamic = 'force-dynamic';

type Range = '7d' | '30d' | '90d';

function isValidRange(v: string | undefined): v is Range {
  return v === '7d' || v === '30d' || v === '90d';
}

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}): Promise<React.JSX.Element> {
  const { range: rawRange } = await searchParams;
  const range: Range = isValidRange(rawRange) ? rawRange : '7d';

  const [sources, volumeData] = await Promise.all([
    fetchSources(),
    fetchVolumeStats(range),
  ]);

  return (
    <div>
      <PageHeader title="Entry Volume" description="Crawl throughput over time, by source and category." />
      <VolumeChart sources={sources} volumeData={volumeData} activeRange={range} />
    </div>
  );
}
