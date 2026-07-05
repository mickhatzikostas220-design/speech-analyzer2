'use client';

import { useEffect, useState } from 'react';

interface Connection {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin' | 'facebook';
  label: string;
  configured: boolean;
  connected: boolean;
  account_name: string | null;
}

const PLATFORM_STYLE: Record<string, { dot: string; glyph: string }> = {
  instagram: { dot: 'from-fuchsia-500 to-amber-500', glyph: 'IG' },
  tiktok: { dot: 'from-cyan-400 to-pink-500', glyph: 'TT' },
  youtube: { dot: 'from-red-500 to-red-700', glyph: 'YT' },
  twitter: { dot: 'from-zinc-400 to-zinc-600', glyph: '𝕏' },
  linkedin: { dot: 'from-sky-600 to-blue-800', glyph: 'in' },
  facebook: { dot: 'from-blue-500 to-blue-700', glyph: 'f' },
};

export function ConnectionsPanel({ refresh = 0 }: { refresh?: number }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch('/api/clipflow/connections');
      const data = await res.json();
      setConnections(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  // Reload when the accounts panel above changes (it bumps `refresh`).
  useEffect(() => {
    load();
  }, [refresh]);

  async function disconnect(platform: string) {
    await fetch(`/api/clipflow/connections/${platform}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="mb-1">
        <h2 className="text-base font-semibold text-strong">Connect accounts to post</h2>
      </div>
      <p className="mb-4 text-xs text-muted">
        Sign in to each platform to publish your clips — no API key needed. Disconnect any time.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(loading ? Array.from({ length: 4 }) : connections).map((c, i) => {
          const conn = c as Connection | undefined;
          if (!conn) {
            return <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)]" />;
          }
          const style = PLATFORM_STYLE[conn.platform];
          return (
            <div
              key={conn.platform}
              className="card flex flex-col items-center gap-2 p-3 text-center"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${style.dot} text-xs font-bold text-white`}
              >
                {style.glyph}
              </div>
              <span className="text-xs font-medium leading-tight text-strong">{conn.label}</span>

              {!conn.configured ? (
                <span className="text-[10px] text-faint">Not available yet</span>
              ) : conn.connected ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="max-w-[90px] truncate text-[10px] text-[color:var(--success)]">
                    {conn.account_name || 'Connected'}
                  </span>
                  <button
                    onClick={() => disconnect(conn.platform)}
                    className="text-[10px] text-muted transition-colors hover:text-[color:var(--danger)]"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <a
                  href={`/api/clipflow/connections/${conn.platform}/authorize`}
                  className="rounded-full border border-[color:var(--signature)] px-2.5 py-1 text-[10px] font-medium transition-colors hover:bg-[var(--signature)] hover:text-[color:var(--on-signature)]"
                  style={{ color: 'var(--text-link)' }}
                >
                  Sign in →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
