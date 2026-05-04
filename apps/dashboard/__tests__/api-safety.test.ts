import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Gap 1 (T-07-01 / DASH-04): lib/api.server.ts must have `import 'server-only'` as its
// first non-blank line to prevent the module from being imported in a client bundle.
// Gap 2 (T-07-02 / DASH-04): lib/api.client.ts must NOT reference process.env.API_URL —
// only NEXT_PUBLIC_API_URL is permitted in the browser-safe client module.

const DASHBOARD_ROOT = path.resolve(__dirname, '..');

describe('API module safety contracts (DASH-04)', () => {
  describe('api.server.ts — server-only guard (T-07-01)', () => {
    it("first non-blank line is `import 'server-only'`", () => {
      const content = readFileSync(
        path.join(DASHBOARD_ROOT, 'lib', 'api.server.ts'),
        'utf-8',
      );
      const lines = content.split('\n');
      const firstNonBlank = lines.find((line) => line.trim() !== '');
      expect(firstNonBlank?.trim()).toBe("import 'server-only';");
    });
  });

  describe('api.client.ts — no private API_URL leak (T-07-02)', () => {
    it('does NOT contain the string `process.env.API_URL` (only NEXT_PUBLIC_API_URL is allowed)', () => {
      const content = readFileSync(
        path.join(DASHBOARD_ROOT, 'lib', 'api.client.ts'),
        'utf-8',
      );
      // Must not reference the server-only env var in the client module.
      // process.env.NEXT_PUBLIC_API_URL is fine; bare API_URL is the leak.
      const hasPrivateVar = /process\.env\.API_URL(?!_)/.test(content);
      expect(hasPrivateVar).toBe(false);
    });

    it('DOES reference NEXT_PUBLIC_API_URL as the base URL', () => {
      const content = readFileSync(
        path.join(DASHBOARD_ROOT, 'lib', 'api.client.ts'),
        'utf-8',
      );
      expect(content).toContain('process.env.NEXT_PUBLIC_API_URL');
    });
  });
});
