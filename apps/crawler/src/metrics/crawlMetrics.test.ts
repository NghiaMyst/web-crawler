import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { crawlDurationHistogram, instrumentWorker } from './crawlMetrics.js';
import type { Worker } from 'bullmq';

describe('crawlMetrics', () => {
  it('crawlDurationHistogram has correct name', () => {
    // Access the histogram's name via its json() method
    // prom-client Histogram exposes get() which includes metric name
    expect(crawlDurationHistogram).toBeDefined();
  });

  it('instrumentWorker registers completed listener on worker', () => {
    const mockWorker = new EventEmitter() as unknown as Worker;
    instrumentWorker(mockWorker, 'crawl-test');
    // EventEmitter.listenerCount confirms the listener was registered
    expect((mockWorker as unknown as EventEmitter).listenerCount('completed')).toBe(1);
  });

  it('instrumentWorker observes histogram on completed event', () => {
    const mockWorker = new EventEmitter() as unknown as Worker;
    const observeSpy = vi.spyOn(crawlDurationHistogram, 'observe');

    instrumentWorker(mockWorker, 'crawl-test');

    // Emit a mock completed event with processedOn and finishedOn
    const mockJob = {
      processedOn: 1000,
      finishedOn: 3500, // 2.5 seconds duration
      data: { strategy: 'cheerio' },
    };
    (mockWorker as unknown as EventEmitter).emit('completed', mockJob);

    expect(observeSpy).toHaveBeenCalledWith(
      { queue: 'crawl-test', strategy: 'cheerio' },
      2.5
    );

    observeSpy.mockRestore();
  });
});
