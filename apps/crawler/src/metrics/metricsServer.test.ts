import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { startMetricsServer } from './metricsServer.js';

// Use a different port than production to avoid conflicts
const TEST_PORT = 19464;

// We need to close the server after tests
// startMetricsServer returns void; patch it to capture the server
// Instead, test via HTTP request to a started server
let serverStarted = false;

describe('metricsServer', () => {
  it('GET /metrics returns 200', async () => {
    if (!serverStarted) {
      startMetricsServer([], TEST_PORT);
      serverStarted = true;
      // Small delay for server to start listening
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const response = await new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const req = http.get(`http://localhost:${TEST_PORT}/metrics`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body }));
      });
      req.on('error', reject);
    });

    expect(response.statusCode).toBe(200);
  });

  it('GET /metrics Content-Type contains text/plain', async () => {
    const response = await new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const req = http.get(`http://localhost:${TEST_PORT}/metrics`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body }));
      });
      req.on('error', reject);
    });

    const contentType = response.headers['content-type'] as string ?? '';
    expect(contentType).toContain('text/plain');
  });

  it('GET /metrics body contains Prometheus format marker', async () => {
    const response = await new Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const req = http.get(`http://localhost:${TEST_PORT}/metrics`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, body }));
      });
      req.on('error', reject);
    });

    expect(response.body).toContain('# HELP');
  });
});
