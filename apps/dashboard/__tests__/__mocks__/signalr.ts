import { vi } from 'vitest';

export const HubConnectionState = {
  Disconnected: 'Disconnected',
  Connected: 'Connected',
  Reconnecting: 'Reconnecting',
  Connecting: 'Connecting',
  Disconnecting: 'Disconnecting',
} as const;

export function createMockConnection() {
  const handlers: Record<string, Function[]> = {};
  let reconnectedCb: Function | null = null;
  let reconnectingCb: Function | null = null;
  let closeCb: Function | null = null;

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    }),
    onreconnected: vi.fn((cb: Function) => {
      reconnectedCb = cb;
    }),
    onreconnecting: vi.fn((cb: Function) => {
      reconnectingCb = cb;
    }),
    onclose: vi.fn((cb: Function) => {
      closeCb = cb;
    }),
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    state: HubConnectionState.Disconnected,
    // Test helpers to simulate events:
    _emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
    _simulateReconnected() {
      reconnectedCb?.();
    },
    _simulateReconnecting() {
      reconnectingCb?.();
    },
    _simulateClose() {
      closeCb?.();
    },
  };
}
