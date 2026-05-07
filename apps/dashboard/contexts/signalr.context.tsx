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

    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect([0, 2000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    // Register lifecycle callbacks BEFORE start()
    conn.onreconnecting(() => {
      setState(HubConnectionState.Reconnecting);
    });

    conn.onreconnected(async () => {
      setState(HubConnectionState.Connected);
      const gapFn = onReconnectRef.current;
      if (gapFn) {
        try {
          await gapFn();
        } catch {
          // gap recovery is best-effort
        }
      }
    });

    conn.onclose(() => {
      setState(HubConnectionState.Disconnected);
      toast.error('Live updates disconnected');
    });

    setConnection(conn);

    conn
      .start()
      .then(() => setState(HubConnectionState.Connected))
      .catch(() => setState(HubConnectionState.Disconnected));

    return () => {
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
