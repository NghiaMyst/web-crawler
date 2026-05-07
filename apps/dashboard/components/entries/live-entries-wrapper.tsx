'use client';

import { useEffect, useRef, useState } from 'react';
import { useSignalRContext } from '@/contexts/signalr.context';
import { EntriesTable } from './entries-table';
import type { DataEntry } from '@/types/api';
import { fetchEntriesFrom } from '@/lib/api.client';
import { toast } from 'sonner';

const ROW_CAP = 200;

interface LiveEntriesWrapperProps {
  serverEntries: DataEntry[];
}

export function LiveEntriesWrapper({ serverEntries }: LiveEntriesWrapperProps): React.JSX.Element {
  const { connection, registerReconnectHandler } = useSignalRContext();
  const [liveEntries, setLiveEntries] = useState<DataEntry[]>([]);
  const lastReceivedAtRef = useRef<string | null>(null);
  const serverEntriesLengthRef = useRef(serverEntries.length);

  useEffect(() => {
    serverEntriesLengthRef.current = serverEntries.length;
  }, [serverEntries.length]);

  useEffect(() => {
    if (!connection) return;

    const handler = (entry: DataEntry) => {
      lastReceivedAtRef.current = entry.crawledAt;
      setLiveEntries((prev) => {
        const combined = [entry, ...prev];
        const totalRows = combined.length + serverEntriesLengthRef.current;
        if (totalRows > ROW_CAP) {
          return combined.slice(0, Math.max(0, ROW_CAP - serverEntriesLengthRef.current));
        }
        return combined;
      });
    };

    connection.on('NewEntry', handler);
    return () => {
      connection.off('NewEntry', handler);
    };
  }, [connection]);

  useEffect(() => {
    if (!registerReconnectHandler) return;

    const gapRecovery = async () => {
      const since = lastReceivedAtRef.current;
      if (!since) {
        toast.success('Reconnected — no missed entries');
        return;
      }
      try {
        const result = await fetchEntriesFrom(since, 50);
        const count = result.items.length;
        if (count > 0) {
          setLiveEntries((prev) => [...result.items, ...prev].slice(0, ROW_CAP));
          toast.success(`Reconnected — loaded ${count} missed entries`);
        } else {
          toast.success('Reconnected — no missed entries');
        }
      } catch {
        toast.success('Reconnected — no missed entries');
      }
    };

    registerReconnectHandler(gapRecovery);
    return () => {
      registerReconnectHandler(null);
    };
  }, [registerReconnectHandler]);

  const allEntries = [...liveEntries, ...serverEntries].slice(0, ROW_CAP);

  return <EntriesTable entries={allEntries} />;
}
