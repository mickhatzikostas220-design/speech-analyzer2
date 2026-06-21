'use client';

import { useEffect, useState } from 'react';

interface Connection {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter';
  label: string;
  configured: boolean;
  connected: boolean;
  account_name: string | null;
  provider?: 'oauth' | 'postiz';
  manage_url?: string;
}

const PLATFORM_STYLE: Record<string, { dot: string; glyph: string }> = {
  instagram: { dot: 'from-fuchsia-500 to-amber-500', glyph: 'IG' },
  tiktok: { dot: 'from-cyan-400 to-pink-500', glyph: 'TT' },
  youtube: { dot: 'from-red-500 to-red-700', glyph: 'YT' },
  twitter: { dot: 'from-zinc-400 to-zinc-600', glyph: '𝕏' },
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

  // Reload when the Postiz key changes (the panel above bumps `refresh`).
  useEffect(() => {
    load();
  }, [refresh]);

  async function disconnect(platform: string) {
    await fetch(`/api/clipflow/connections/${platform}`, { method: 'DELETE' });
    load();
  }

  // When Postiz is the provider it owns the platform connections — accounts are
  // managed in the Postiz workspace, not via per-platform OAuth in this app.
  const viaPostiz = connections.some((c) => c.provider === 'postiz');
  const manageUrl = connections.find((c) => c.manage_url)?.manage_url ?? 'https://app.postiz.com';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">Connected platforms</h2>
          {viaPostiz && (
            <span className="text-[10px] uppercase tracking-wide text-purple-300 bg-purple-950/50 border border-purple-800 rounded-full px-2 py-0.5">
              via Postiz
            </span>
          )}
        </div>
        {viaPostiz && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Manage in Postiz ↗
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(loading ? Array.from({ length: 4 }) : connections).map((c, i) => {
          const conn = c as Connection | undefined;
          if (!conn) {
            return <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-24 animate-pulse" />;
          }
          const style = PLATFORM_STYLE[conn.platform];
          return (
            <div
              key={conn.platform}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col items-center text-center gap-2"
            >
              <div
                className={`w-9 h-9 rounded-lg bg-gradient-to-br ${style.dot} flex items-center justify-center text-xs font-bold text-white`}
              >
                {style.glyph}
              </div>
              <span className="text-xs font-medium text-white leading-tight">{conn.label}</span>

              {conn.provider === 'postiz' ? (
                conn.connected ? (
                  <span className="text-[10px] text-green-400 truncate max-w-[90px]">
                    {conn.account_name || 'Connected'}
                  </span>
                ) : (
                  <a
                    href={conn.manage_url || manageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    Add in Postiz →
                  </a>
                )
              ) : !conn.configured ? (
                <span className="text-[10px] text-zinc-600">Not configured</span>
              ) : conn.connected ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-green-400 truncate max-w-[90px]">
                    {conn.account_name || 'Connected'}
                  </span>
                  <button
                    onClick={() => disconnect(conn.platform)}
                    className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <a
                  href={`/api/clipflow/connections/${conn.platform}/authorize`}
                  className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Connect →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
