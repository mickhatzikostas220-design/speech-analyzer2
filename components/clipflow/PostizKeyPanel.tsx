'use client';

import { useEffect, useState } from 'react';

interface Status {
  connected: boolean;
  source: 'user' | 'env' | null;
  api_url: string | null;
  manage_url?: string | null;
  channels: number | null;
}

const DEFAULT_API_URL = 'https://api.upload-post.com/public/v1';

function channelsLabel(n: number | null): string {
  if (typeof n !== 'number') return '';
  return ` · ${n} channel${n === 1 ? '' : 's'}`;
}

// Lets each speaker connect their own Postiz workspace (bring-your-own key) so
// clips post to their own accounts. Falls back to the app-wide default if the
// operator set POSTIZ_API_KEY.
export function PostizKeyPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/clipflow/postiz');
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

  async function save() {
    if (!apiKey.trim()) {
      setError('Enter your Upload Post API key.');
      return;
    }
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch('/api/clipflow/postiz', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), apiUrl: apiUrl.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your key.');
      setApiKey('');
      setApiUrl('');
      setEditing(false);
      setShowAdvanced(false);
      setMsg(`Connected${channelsLabel(data.channels)}.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your key.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await fetch('/api/clipflow/postiz', { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.');
    } finally {
      setSaving(false);
    }
  }

  const connectedAsUser = status?.connected && status.source === 'user';
  const connectedAsEnv = status?.connected && status.source === 'env';
  const showForm = !loading && (!status?.connected || editing);
  const customApi = status?.api_url && status.api_url !== DEFAULT_API_URL ? status.api_url : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Publish with Upload Post</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Connect your own Upload Post account to post clips to your social channels — no
            per-platform app to set up.
          </p>
        </div>
        {connectedAsUser && !editing && (
          <span className="text-[10px] text-green-400 bg-green-950/40 border border-green-800 rounded-full px-2 py-0.5 whitespace-nowrap">
            Connected{channelsLabel(status?.channels ?? null)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-9 bg-zinc-800/60 rounded-lg animate-pulse" />
      ) : connectedAsUser && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          {customApi && <span className="text-[11px] text-zinc-500">{customApi}</span>}
          {status?.manage_url && (
            <a
              href={status.manage_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Manage channels in Upload Post ↗
            </a>
          )}
          <button
            onClick={() => {
              setEditing(true);
              setMsg(null);
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Update key
          </button>
          <button
            onClick={disconnect}
            disabled={saving}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : connectedAsEnv && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-zinc-400">
            Posting through the app&rsquo;s shared Upload Post workspace.
          </span>
          <button
            onClick={() => {
              setEditing(true);
              setMsg(null);
            }}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Use my own Upload Post account →
          </button>
        </div>
      ) : null}

      {showForm && (
        <div className="space-y-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Upload Post API key"
            autoComplete="off"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
          />

          {showAdvanced && (
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="Self-hosted URL (optional) — e.g. https://upload-post.example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Connecting…' : 'Connect Upload Post'}
            </button>
            {(status?.connected || editing) && (
              <button
                onClick={() => {
                  setEditing(false);
                  setApiKey('');
                  setApiUrl('');
                  setError(null);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showAdvanced ? 'Hide self-hosting' : 'Self-hosting?'}
            </button>
          </div>

          <p className="text-[11px] text-zinc-600">
            Get your key at{' '}
            <a
              href="https://app.upload-post.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:text-purple-300"
            >
              app.upload-post.com/api-keys
            </a>
            . It&rsquo;s stored encrypted and never shown again.
          </p>
        </div>
      )}

      {msg && <p className="text-[11px] text-green-400">{msg}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
