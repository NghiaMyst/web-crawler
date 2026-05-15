import type { Metadata } from 'next';
import { fetchSources, fetchVolumeStats } from '@/lib/api.server';
import { VolumeChart } from '@/components/charts/VolumeChart';

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
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Entry Volume</h1>
      <VolumeChart sources={sources} volumeData={volumeData} activeRange={range} />
    </div>
  );
}
