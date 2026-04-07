import { chromium, type Browser } from 'playwright';
import { logger } from '../logger.js';

const MAX_BROWSERS = 3; // CRAWL-03: max 3 browser instances

// DOCKER CRITICAL ARGS (from playwright.dev/docs/docker):
// --no-sandbox: required when running as root in Docker containers
// --disable-dev-shm-usage: Docker limits /dev/shm to 64MB; redirect to /tmp
// --disable-gpu: not needed in headless, reduces overhead
const DOCKER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

export class BrowserPool {
  private browsers: Browser[] = [];
  private available: Browser[] = [];
  private waitQueue: Array<(browser: Browser) => void> = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing browser pool', { maxBrowsers: MAX_BROWSERS });

    for (let i = 0; i < MAX_BROWSERS; i++) {
      const browser = await chromium.launch({
        headless: true,
        args: DOCKER_LAUNCH_ARGS,
      });
      this.browsers.push(browser);
      this.available.push(browser);
    }

    this.initialized = true;
    logger.info('Browser pool ready', { count: MAX_BROWSERS });
  }

  async acquire(): Promise<Browser> {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }

    // Wait for a browser to be released
    return new Promise<Browser>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(browser: Browser): void {
    const next = this.waitQueue.shift();
    if (next !== undefined) {
      next(browser);
    } else {
      this.available.push(browser);
    }
  }

  async closeAll(): Promise<void> {
    logger.info('Closing browser pool');
    await Promise.all(this.browsers.map((b) => b.close()));
    this.browsers = [];
    this.available = [];
    this.initialized = false;
  }
}

// Singleton pool shared across all Playwright workers
export const browserPool = new BrowserPool();
