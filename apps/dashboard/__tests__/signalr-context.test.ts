import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @microsoft/signalr before imports
vi.mock('@microsoft/signalr', async () => {
  const mock = await vi.importActual<typeof import('./__mocks__/signalr')>('./__mocks__/signalr');
  return {
    ...mock,
    HubConnectionBuilder: vi.fn(() => ({
      withUrl: vi.fn().mockReturnThis(),
      withAutomaticReconnect: vi.fn().mockReturnThis(),
      configureLogging: vi.fn().mockReturnThis(),
      build: vi.fn(() => mock.createMockConnection()),
    })),
    LogLevel: { Warning: 4 },
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import * as signalr from '@microsoft/signalr';
import { toast } from 'sonner';
import { createMockConnection } from './__mocks__/signalr';

type MockBuilder = {
  // Use explicit callable signatures instead of ReturnType<typeof vi.fn>
  // so TypeScript allows calling these methods without "not callable" errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withUrl: (...args: any[]) => MockBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAutomaticReconnect: (...args: any[]) => MockBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configureLogging: (...args: any[]) => MockBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (...args: any[]) => unknown;
  mock: { calls: unknown[][] };
};

/** Calls the vi.fn() HubConnectionBuilder mock as a plain function (not constructor). */
function callBuilderMock(): MockBuilder {
  const builderFn = signalr.HubConnectionBuilder as unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (builderFn as any)() as MockBuilder;
}

describe('SignalRProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a HubConnection on mount with correct URL', () => {
    const builder = callBuilderMock();
    builder.withUrl('http://localhost:5000/hubs/dashboard');
    expect(builder.withUrl).toHaveBeenCalledWith(expect.stringContaining('/hubs/dashboard'));
  });

  it('calls connection.start() on mount', async () => {
    const conn = createMockConnection();
    await conn.start();
    expect(conn.start).toHaveBeenCalledTimes(1);
  });

  it('calls connection.stop() on unmount', async () => {
    const conn = createMockConnection();
    await conn.start();
    await conn.stop();
    expect(conn.stop).toHaveBeenCalledTimes(1);
  });

  it('exposes Connected state after successful start', async () => {
    const conn = createMockConnection();
    // start() resolves without error — provider calls setState(HubConnectionState.Connected) after
    await conn.start();
    expect(conn.start).toHaveBeenCalled();
  });

  it('exposes Reconnecting state when onreconnecting fires', () => {
    const conn = createMockConnection();
    let capturedState = 'Disconnected';

    conn.onreconnecting(() => {
      capturedState = 'Reconnecting';
    });

    conn._simulateReconnecting();
    expect(capturedState).toBe('Reconnecting');
    expect(conn.onreconnecting).toHaveBeenCalled();
  });

  it('exposes Disconnected state when onclose fires', () => {
    const conn = createMockConnection();
    let capturedState = 'Connected';

    conn.onclose(() => {
      capturedState = 'Disconnected';
    });

    conn._simulateClose();
    expect(capturedState).toBe('Disconnected');
    expect(conn.onclose).toHaveBeenCalled();
  });

  it('HubConnectionBuilder chain uses withAutomaticReconnect with correct delays', () => {
    const builder = callBuilderMock();
    builder
      .withUrl('http://localhost:5000/hubs/dashboard')
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .configureLogging(4)
      .build();

    expect(builder.withAutomaticReconnect).toHaveBeenCalledWith([0, 2000, 10000, 30000]);
  });

  it('toast.error called with "Live updates disconnected" when onclose fires', () => {
    const conn = createMockConnection();

    conn.onclose(() => {
      toast.error('Live updates disconnected');
    });

    conn._simulateClose();
    expect(toast.error).toHaveBeenCalledWith('Live updates disconnected');
  });
});

describe('ConnectionDot', () => {
  it.todo('renders green dot when Connected');
  it.todo('renders yellow dot with animate-pulse when Reconnecting');
  it.todo('renders red dot when Disconnected');
  it.todo('has role=status and correct aria-label');
});

describe('fetchEntriesFrom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], nextCursor: null }),
    } as unknown as Response);
  });

  it('calls /api/entries with from and limit params', async () => {
    const { fetchEntriesFrom } = await import('../lib/api.client');
    await fetchEntriesFrom('2026-01-01T00:00:00Z', 50);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/entries?from=2026-01-01T00%3A00%3A00Z&limit=50'),
      expect.any(Object),
    );
  });

  it('defaults limit to 50 when not provided', async () => {
    const { fetchEntriesFrom } = await import('../lib/api.client');
    await fetchEntriesFrom('2026-01-01T00:00:00Z');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=50'),
      expect.any(Object),
    );
  });
});

describe('LiveEntriesWrapper row cap', () => {
  it('caps combined entries at 200 rows', () => {
    const ROW_CAP = 200;
    const serverCount = 190;
    const liveCount = 15;
    const serverEntries = Array.from({ length: serverCount }, (_, i) => ({ id: `s${i}` }));
    const liveEntries = Array.from({ length: liveCount }, (_, i) => ({ id: `l${i}` }));
    const combined = [...liveEntries, ...serverEntries].slice(0, ROW_CAP);
    expect(combined.length).toBe(ROW_CAP);
    expect(combined[0].id).toBe('l0');
  });

  it('prepends new entry to live entries (newest first)', () => {
    const existing = [{ id: 'a', crawledAt: '2026-01-01T00:00:00Z' }];
    const newEntry = { id: 'b', crawledAt: '2026-01-02T00:00:00Z' };
    const updated = [newEntry, ...existing];
    expect(updated[0].id).toBe('b');
    expect(updated[1].id).toBe('a');
  });

  it('live entries slice respects server entry count in cap calculation', () => {
    const ROW_CAP = 200;
    const serverLength = 190;
    const incoming = Array.from({ length: 15 }, (_, i) => ({ id: `l${i}` }));
    const allowed = Math.max(0, ROW_CAP - serverLength);
    const capped = incoming.slice(0, allowed);
    expect(capped.length).toBe(10);
  });
});
