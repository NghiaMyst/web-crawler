'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Dashboard error boundary:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-4">
      <h2 className="text-xl font-semibold text-zinc-900">Something went wrong</h2>
      <p className="text-sm text-zinc-600 max-w-md">
        Failed to load data. Check that the API is reachable, then refresh the page.
      </p>
      <Button onClick={reset} variant="default">
        Try again
      </Button>
    </div>
  );
}
