import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @microsoft/signalr
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: {
    Connected: 'Connected',
    Reconnecting: 'Reconnecting',
    Disconnected: 'Disconnected',
    Connecting: 'Connecting',
    Disconnecting: 'Disconnecting',
  },
}));

// Mock the signalr context — control what useSignalRContext returns
const mockUseSignalRContext = vi.fn();
vi.mock('@/contexts/signalr.context', () => ({
  useSignalRContext: (...args: unknown[]) => mockUseSignalRContext(...args),
}));

describe('ConnectionDot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSignalRContext.mockReturnValue({
      connection: null,
      state: 'Disconnected',
      registerReconnectHandler: vi.fn(),
    });
  });

  it('is exported as a function component', async () => {
    const mod = await import('../components/connection/connection-dot');
    expect(typeof mod.ConnectionDot).toBe('function');
  });

  it('stateConfig has correct color for Connected state', async () => {
    const mod = await import('../components/connection/connection-dot');
    const config = mod.stateConfig['Connected'];
    expect(config).toBeDefined();
    expect(config.color).toBe('bg-green-500');
    expect(config.pulse).toBe(false);
    expect(config.label).toBe('Connected');
  });

  it('stateConfig has correct color and pulse for Reconnecting state', async () => {
    const mod = await import('../components/connection/connection-dot');
    const config = mod.stateConfig['Reconnecting'];
    expect(config).toBeDefined();
    expect(config.color).toBe('bg-yellow-400');
    expect(config.pulse).toBe(true);
    expect(config.label).toBe('Reconnecting');
  });

  it('stateConfig has correct color for Disconnected state', async () => {
    const mod = await import('../components/connection/connection-dot');
    const config = mod.stateConfig['Disconnected'];
    expect(config).toBeDefined();
    expect(config.color).toBe('bg-red-500');
    expect(config.pulse).toBe(false);
    expect(config.label).toBe('Disconnected');
  });

  it('stateConfig has role=status attribute (via aria-label field)', async () => {
    const mod = await import('../components/connection/connection-dot');
    // Verify all states have labels (these are used for role=status aria-label)
    expect(mod.stateConfig['Connected'].label).toBe('Connected');
    expect(mod.stateConfig['Reconnecting'].label).toBe('Reconnecting');
    expect(mod.stateConfig['Disconnected'].label).toBe('Disconnected');
  });

  it('stateConfig covers all three visual states', async () => {
    const mod = await import('../components/connection/connection-dot');
    expect(Object.keys(mod.stateConfig)).toContain('Connected');
    expect(Object.keys(mod.stateConfig)).toContain('Reconnecting');
    expect(Object.keys(mod.stateConfig)).toContain('Disconnected');
  });
});
