import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for visual regression snapshots (Phase 13 D-10).
 * Single project: Chromium headless at 1280x800 (Desktop Chrome).
 * The dev server is started automatically via the webServer block.
 */
export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/__snapshots__',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
});
