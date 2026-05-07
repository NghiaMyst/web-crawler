'use client';

import { HubConnectionState } from '@microsoft/signalr';
import { useSignalRContext } from '@/contexts/signalr.context';

export const stateConfig: Record<string, { color: string; pulse: boolean; label: string }> = {
  [HubConnectionState.Connected]: {
    color: 'bg-green-500',
    pulse: false,
    label: 'Connected',
  },
  [HubConnectionState.Reconnecting]: {
    color: 'bg-yellow-400',
    pulse: true,
    label: 'Reconnecting',
  },
  [HubConnectionState.Disconnected]: {
    color: 'bg-red-500',
    pulse: false,
    label: 'Disconnected',
  },
};

export function ConnectionDot(): React.JSX.Element {
  const { state } = useSignalRContext();
  const config = stateConfig[state] ?? stateConfig[HubConnectionState.Disconnected];

  return (
    <span
      role="status"
      aria-label={config.label}
      className={`inline-block w-2 h-2 rounded-full ${config.color}${config.pulse ? ' animate-pulse' : ''}`}
    />
  );
}
