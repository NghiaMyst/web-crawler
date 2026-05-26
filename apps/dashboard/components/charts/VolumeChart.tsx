'use client';

import { useRouter } from 'next/navigation';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BarChart3 } from 'lucide-react';
import type { Source, VolumeDataPoint } from '@/types/api';

type Range = '7d' | '30d' | '90d';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function pivotVolumeData(rows: VolumeDataPoint[]): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!map.has(row.date)) map.set(row.date, { date: row.date });
    map.get(row.date)![row.sourceName] = row.count;
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
}

function getSourceNames(rows: VolumeDataPoint[]): string[] {
  return [...new Set(rows.map((r) => r.sourceName))];
}

export function VolumeChart({
  sources: _sources,
  volumeData,
  activeRange,
}: {
  sources: Source[];
  volumeData: VolumeDataPoint[];
  activeRange: Range;
}): React.JSX.Element {
  const router = useRouter();

  function handleRangeChange(value: string | null): void {
    if (!value) return;
    router.push(`/charts?range=${value}`);
  }

  const pivoted = pivotVolumeData(volumeData);
  const sourceNames = getSourceNames(volumeData);
  const isEmpty = sourceNames.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Select value={activeRange} onValueChange={handleRangeChange}>
          <SelectTrigger className="w-[160px]" aria-label="Select date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border p-12 gap-3 text-muted-foreground">
          <BarChart3 size={36} className="opacity-40" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No data to display</p>
          <p className="text-xs">Charts appear once entries have been crawled.</p>
        </div>
      ) : (
        <>
          <section className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Entries over time</h2>
            <div className="h-64" aria-label="Entry volume chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pivoted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {sourceNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-sm p-6 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Per-source breakdown</h2>
            <div className="h-64" aria-label="Entry volume chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pivoted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {sourceNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="a"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
