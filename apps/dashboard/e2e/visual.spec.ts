import { test, expect } from '@playwright/test';

/**
 * Visual regression snapshots — Phase 13 D-10.
 *
 * Captures each of the four key pages with the dashboard's empty state
 * (no API required). This proves the Variant B layout + palette renders
 * correctly even before crawl data is present.
 *
 * Baselines live in e2e/__snapshots__/ and are committed to the repo.
 * Regenerate with: pnpm test:e2e:update
 */

const PAGES = [
  { path: '/entries', name: 'entries' },
  { path: '/charts',  name: 'charts'  },
  { path: '/sources', name: 'sources' },
  { path: '/jobs',    name: 'jobs'    },
] as const;

for (const { path, name } of PAGES) {
  test(`${name} page matches Variant B baseline`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // Allow font loading + suspense fallback resolution.
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
    });
  });
}
