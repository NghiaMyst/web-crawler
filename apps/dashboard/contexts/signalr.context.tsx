'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { toast } from 'sonner';

interface SignalRContextValue {
  connection: HubConnection | null;
  state: HubConnectionState;
  registerReconnectHandler: (fn: (() => Promise<void>) | null) => void;
}

const SignalRContext = createContext<SignalRContextValue>({
  connection: null,
  state: HubConnectionState.Disconnected,
  registerReconnectHandler: () => {},
});

export function SignalRProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [state, setState] = useState<HubConnectionState>(HubConnectionState.Disconnected);
  const onReconnectRef = useRef<(() => Promise<void>) | null>(null);

  const registerReconnectHandler = useCallback((fn: (() => Promise<void>) | null) => {
    onReconnectRef.current = fn;
  }, []);

  useEffect(() => {
    const hubUrl = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'}/hubs/dashboard`;
    // Tracks intentional cleanup so onclose doesn't start a reconnect loop after unmount
    let unmounted = false;

    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect({
        // Infinite reconnect for transport-level drops: 0 → 2s → 10s → 30s forever
        nextRetryDelayInMilliseconds: (ctx) => {
          const delays = [0, 2000, 10000];
          return delays[ctx.previousRetryCount] ?? 30000;
        },
      })
      .configureLogging(LogLevel.Warning)
      .build();

    conn.onreconnecting(() => {
      setState(HubConnectionState.Reconnecting);
    });

    conn.onreconnected(async () => {
      setState(HubConnectionState.Connected);
      const gapFn = onReconnectRef.current;
      if (gapFn) {
        try {
          await gapFn();
          return;
        } catch {
          // gap recovery failed — fall through to default toast
        }
      }
      toast.success('Reconnected — no missed entries');
    });

    // onclose fires on graceful server shutdown (SignalR Close message) which bypasses
    // withAutomaticReconnect. Manually retry until reconnected or component unmounts.
    const startWithRetry = (delayMs: number) => {
      if (unmounted) return;
      setTimeout(() => {
        if (unmounted) return;
        setState(HubConnectionState.Reconnecting);
        conn
          .start()
          .then(() => {
            setState(HubConnectionState.Connected);
            toast.success('Reconnected — no missed entries');
          })
          .catch(() => startWithRetry(Math.min(delayMs * 2, 30000)));
      }, delayMs);
    };

    conn.onclose(() => {
      if (unmounted) return;
      setState(HubConnectionState.Disconnected);
      startWithRetry(2000);
    });

    setConnection(conn);

    conn
      .start()
      .then(() => setState(HubConnectionState.Connected))
      .catch(() => setState(HubConnectionState.Disconnected));

    return () => {
      unmounted = true;
      conn.stop();
    };
  }, []);

  return (
    <SignalRContext.Provider value={{ connection, state, registerReconnectHandler }}>
      {children}
    </SignalRContext.Provider>
  );
}

export function useSignalRContext(): SignalRContextValue {
  return useContext(SignalRContext);
}
