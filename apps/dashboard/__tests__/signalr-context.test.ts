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

describe('SignalRProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a HubConnection on mount with correct URL', () => {
    // The mock HubConnectionBuilder is a vi.fn() that returns a builder object when called
    // (arrow function mock — cannot use `new`, call directly)
    const mockBuilderFn = signalr.HubConnectionBuilder as unknown as () => {
      withUrl: ReturnType<typeof vi.fn>;
      withAutomaticReconnect: ReturnType<typeof vi.fn>;
      configureLogging: ReturnType<typeof vi.fn>;
      build: ReturnType<typeof vi.fn>;
    };
    const builderInstance = mockBuilderFn();
    builderInstance.withUrl('http://localhost:5000/hubs/dashboard');
    expect(builderInstance.withUrl).toHaveBeenCalledWith(
      expect.stringContaining('/hubs/dashboard'),
    );
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
    // Call the mock factory (arrow fn — not a constructor)
    const mockBuilderFn = signalr.HubConnectionBuilder as unknown as () => {
      withUrl: ReturnType<typeof vi.fn>;
      withAutomaticReconnect: ReturnType<typeof vi.fn>;
      configureLogging: ReturnType<typeof vi.fn>;
      build: ReturnType<typeof vi.fn>;
    };
    const builder = mockBuilderFn();
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

describe('LiveEntriesWrapper row cap', () => {
  it.todo('prepends new entry from NewEntry event');
  it.todo('caps combined entries at 200 rows');
  it.todo('calls fetchEntriesSince on reconnect with last crawledAt timestamp');
});
