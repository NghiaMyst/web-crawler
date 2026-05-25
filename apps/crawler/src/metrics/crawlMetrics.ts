import { Histogram } from 'prom-client';
import type { Worker } from 'bullmq';

export const crawlDurationHistogram = new Histogram({
  name: 'crawler_crawl_duration_seconds',
  help: 'Crawl job duration in seconds from processedOn to finishedOn',
  labelNames: ['queue', 'strategy'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
});

export function instrumentWorker(worker: Worker, queueName: string): void {
  worker.on('completed', (job) => {
    // processedOn and finishedOn are Unix ms timestamps set by BullMQ
    if (job.processedOn != null && job.finishedOn != null) {
      const durationSecs = (job.finishedOn - job.processedOn) / 1000;
      const strategy = (job.data as { strategy?: string }).strategy ?? 'unknown';
      crawlDurationHistogram.observe({ queue: queueName, strategy }, durationSecs);
    }
  });
}
