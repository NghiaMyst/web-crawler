import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/navigation hooks since the component imports them at module load.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/entries',
}));

describe('SearchInput module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a SearchInput function component', async () => {
    const mod = await import('../components/search/SearchInput');
    expect(typeof mod.SearchInput).toBe('function');
  });

  it('SearchInput has no arity requirement (renders standalone)', async () => {
    const mod = await import('../components/search/SearchInput');
    // React functional components accept (props) but our SearchInput takes none.
    expect(mod.SearchInput.length).toBeLessThanOrEqual(1);
  });
});
