import { logger } from '../logger.js';
import { browserPool } from './BrowserPool.js';

export interface PlaywrightResult {
  url: string;
  htmlLength: number;
  html: string;
}

export async function playwrightFetch(
  url: string,
  sourceId: string,
  jobId: string,
): Promise<PlaywrightResult> {
  const browser = await browserPool.acquire();

  try {
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      const html = await page.content();

      if (!html || html.length < 100) {
        throw new Error(`Playwright fetched empty or near-empty HTML from ${url}`);
      }

      logger.info('Playwright crawl result', { url, sourceId, jobId, htmlLength: html.length });

      return { url, htmlLength: html.length, html };
    } finally {
      await page.close();
    }
  } finally {
    browserPool.release(browser);
  }
}

// ARM smoke test — runs once at startup to confirm Playwright works in Docker on ARM64
// Logs result and throws if page renders empty HTML
export async function runPlaywrightSmokeTest(): Promise<void> {
  logger.info('Running Playwright ARM smoke test...');

  await browserPool.initialize();

  const result = await playwrightFetch(
    'https://example.com',
    'smoke-test',
    'smoke-test-001',
  );

  if (result.htmlLength < 100) {
    throw new Error(`Playwright smoke test FAILED: htmlLength=${result.htmlLength}`);
  }

  logger.info('Playwright ARM smoke test PASSED', { htmlLength: result.htmlLength });
}
