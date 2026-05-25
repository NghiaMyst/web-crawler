import { createServer } from 'node:http';
import { register, collectDefaultMetrics } from 'prom-client';
import type { Queue } from 'bullmq';

// Call once at module load — before any test or app code imports this module.
// Pitfall: calling collectDefaultMetrics() twice causes "already registered" crash.
// index.ts must NOT call collectDefaultMetrics() — this module owns it.
collectDefaultMetrics({ prefix: 'crawler_' });

export function startMetricsServer(queues: Queue[], port = 9464): void {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        // Collect prom-client default metrics (Node.js process, GC, event loop)
        const defaultMetrics = await register.metrics();

        // Collect BullMQ queue metrics for all queues via built-in method
        const bullMetrics = await Promise.all(
          queues.map(q => q.exportPrometheusMetrics())
        );

        res.writeHead(200, { 'Content-Type': register.contentType });
        res.end([defaultMetrics, ...bullMetrics].join('\n'));
      } catch (err) {
        res.writeHead(500);
        res.end('Error collecting metrics');
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.info(`Metrics server listening on :${port}/metrics`);
  });
}
