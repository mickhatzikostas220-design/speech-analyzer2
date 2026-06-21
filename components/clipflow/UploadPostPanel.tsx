'use client';

import { useEffect, useState } from 'react';

type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';

interface Status {
  configured: boolean;
  hasOwnKey: boolean;
  sharedKey: boolean;
  keyHint: string | null;
  profile: string | null;
  connected: Platform[];
  names: Partial<Record<Platform, string>>;
}

const LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
};

const API_KEYS_URL = 'https://app.upload-post.com/api-keys';

// Lets each speaker bring their OWN Upload-Post account: they paste the API key
// from app.upload-post.com/api-keys, then connect their TikTok / Instagram /
// YouTube / X accounts via a hosted link, and their clips post to those accounts.
// The key is stored encrypted server-side; the browser only ever sees a last-4 hint.
export function UploadPostPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [keyInput, setKeyInput] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);

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

  async function saveKey() {
    if (keyInput.trim().length < 8) {
      setError('Enter your Upload-Post API key.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/clipflow/uploadpost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that key.');
      setKeyInput('');
      setShowKeyForm(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that key.');
    } finally {
      setWorking(false);
    }
  }

  async function removeKey() {
    setWorking(true);
    setError(null);
    try {
      await fetch('/api/clipflow/uploadpost', { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the key.');
    } finally {
      setWorking(false);
    }
  }

  async function connect() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch('/api/clipflow/uploadpost/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start the connection.');
      // Hosted Upload-Post page; it redirects back to /clipflow when done.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the connection.');
      setWorking(false);
    }
  }

  const connected = status?.connected ?? [];

  // The API-key entry form, reused by the empty state and the "use your own key"
  // toggle when a shared account is active.
  const keyForm = (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder="Upload-Post API key"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveKey()}
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
        />
        <button
          onClick={saveKey}
          disabled={working}
          className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {working ? 'Saving…' : 'Save key'}
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Get your key from{' '}
        <a
          href={API_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-purple-400 hover:text-purple-300 underline"
        >
          app.upload-post.com/api-keys
        </a>
        . Stored encrypted — we only keep a hint of the last 4 characters.
      </p>
    </div>
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Publish accounts</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Connect your own TikTok, Instagram, YouTube, and X accounts to post clips — using your
            own Upload-Post account, no per-platform app to set up.
          </p>
        </div>
        {!loading && connected.length > 0 && (
          <span className="text-[10px] text-green-400 bg-green-950/40 border border-green-800 rounded-full px-2 py-0.5 whitespace-nowrap">
            {connected.length} connected
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-9 bg-zinc-800/60 rounded-lg animate-pulse" />
      ) : !status?.configured ? (
        // No key yet (and no shared account) — prompt the user to add their own.
        keyForm
      ) : (
        <>
          {connected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {connected.map((p) => (
                <span
                  key={p}
                  className="text-[11px] text-green-300 border border-green-800/70 bg-green-950/30 rounded-full px-2 py-0.5"
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
              className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {working ? 'Opening…' : connected.length > 0 ? 'Add / manage accounts' : 'Connect accounts'}
            </button>
          </div>

          {/* Key management */}
          <div className="pt-2 border-t border-zinc-800 space-y-2">
            {status.hasOwnKey ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-400">
                  Using your Upload-Post key
                  {status.keyHint ? (
                    <span className="text-zinc-500"> ····{status.keyHint}</span>
                  ) : null}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowKeyForm((v) => !v)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Replace key
                  </button>
                  <button
                    onClick={removeKey}
                    disabled={working}
                    className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Remove key
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">
                  Using the app&apos;s shared Upload-Post account.
                </span>
                <button
                  onClick={() => setShowKeyForm((v) => !v)}
                  className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Use your own key
                </button>
              </div>
            )}

            {showKeyForm && keyForm}
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
