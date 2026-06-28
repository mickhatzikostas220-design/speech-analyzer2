'use client';

import { useEffect, useState } from 'react';

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';

interface Status {
  configured: boolean;
  connected: Platform[];
  names: Partial<Record<Platform, string>>;
}

const LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
};

// Lets each speaker connect their own social accounts to their Upload-Post
// profile via a hosted link. The Upload-Post account/API key is app-level, so
// end users never paste a key.
export function UploadPostPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/clipflow/uploadpost');
      setStatus(await res.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/clipflow/uploadpost', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start the connection.');
      // Hosted Upload-Post page; it redirects back to /clipflow when done.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection.');
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      await fetch('/api/clipflow/uploadpost', { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.');
    } finally {
      setWorking(false);
    }
  }

  // When Upload-Post isn't configured for the app, this provider is off entirely
  // (ClipFlow falls back to per-platform OAuth), so render nothing.
  if (!loading && !status?.configured) return null;

  const connected = status?.connected ?? [];

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-strong">Publish accounts</h2>
          <p className="mt-0.5 text-xs text-muted">
            Connect your TikTok, Instagram, YouTube, and X accounts to post clips — handled securely
            through Upload-Post, no per-platform app to set up.
          </p>
        </div>
        {!loading && connected.length > 0 && (
          <span className="whitespace-nowrap rounded-full border border-[color:var(--success)]/40 bg-[var(--success-bg)] px-2 py-0.5 text-[10px] text-[color:var(--success)]">
            {connected.length} connected
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-9 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-sunk)]" />
      ) : (
        <>
          {connected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {connected.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-[color:var(--success)]/40 bg-[var(--success-bg)] px-2 py-0.5 text-[11px] text-[color:var(--success)]"
                >
                  {LABELS[p]}
                  {status?.names?.[p] ? ` · ${status.names[p]}` : ''}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={connect}
              disabled={working}
              className="btn-primary text-xs"
              style={{ padding: '8px 16px' }}
            >
              {working ? 'Opening…' : connected.length > 0 ? 'Add / manage accounts' : 'Connect accounts'}
            </button>
            {connected.length > 0 && (
              <button
                onClick={disconnect}
                disabled={working}
                className="text-xs text-muted transition-colors hover:text-[color:var(--danger)] disabled:opacity-50"
              >
                Disconnect all
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-[color:var(--danger)]">{error}</p>}
    </div>
  );
}
