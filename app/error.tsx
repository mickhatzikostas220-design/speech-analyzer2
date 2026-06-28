'use client';

// Branded route-level error boundary. Next.js renders this when a
// rendering/runtime error is thrown anywhere inside the app, so users
// get a recoverable, on-brand screen instead of a blank crash.
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console so it shows up in monitoring/logs.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--surface-page)] px-6 text-center">
      <p className="eyebrow mb-3">Something went wrong</p>
      <h1 className="display-h1 mb-4 text-[color:var(--text-strong)]">
        We hit an unexpected error.
      </h1>
      <p className="mb-8 max-w-md text-[color:var(--text-muted)]">
        This one&apos;s on us. Try again — and if it keeps happening, please let
        us know.
      </p>
      <div className="flex items-center gap-3">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <a href="/dashboard" className="btn-outline">
          Back to Hub
        </a>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-[color:var(--text-faint)]">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
