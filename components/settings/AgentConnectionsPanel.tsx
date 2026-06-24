'use client';

import { useCallback, useEffect, useState } from 'react';

type Provider = 'anthropic' | 'openai';
type Autonomy = 'read_only' | 'draft_confirm' | 'act_directly';

interface Connection {
  id: string;
  provider: string;
  account_email: string | null;
  autonomy: Autonomy;
}
interface SettingsData {
  settings: { provider: Provider; model: string; system_prompt: string | null };
  keyHints: Record<string, string>;
  connections: Connection[];
  providerLabels: Record<string, string>;
  encryptionConfigured: boolean;
  googleConfigured: boolean;
}

const AUTONOMY_LABELS: Record<Autonomy, string> = {
  read_only: 'Read only — can search & read, never write',
  draft_confirm: 'Draft & confirm — can create drafts, never sends',
  act_directly: 'Act directly — can send/act on its own',
};

// Assistant (agent) keys + connected apps, for the shared Settings → Connections
// page. Mirrors the API key + connected-apps controls that used to live on the
// agent settings page; model & custom instructions stay on /agent/settings.
export function AgentConnectionsPanel({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/agent/settings');
    if (!res.ok) return;
    const d: SettingsData = await res.json();
    setData(d);
    setProvider(d.settings.provider);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    setBanner(null);
    const res = await fetch('/api/agent/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key: keyInput.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setSavingKey(false);
    if (res.ok) {
      setKeyInput('');
      setBanner({ kind: 'ok', text: 'API key saved.' });
      load();
      onChanged?.();
    } else {
      setBanner({ kind: 'err', text: j.error || 'Could not save key.' });
    }
  }

  async function removeKey() {
    await fetch(`/api/agent/keys?provider=${provider}`, { method: 'DELETE' });
    setBanner({ kind: 'ok', text: 'API key removed.' });
    load();
    onChanged?.();
  }

  async function setAutonomy(id: string, autonomy: Autonomy) {
    await fetch(`/api/agent/connections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autonomy }),
    });
    load();
  }

  async function disconnect(id: string) {
    await fetch(`/api/agent/connections/${id}`, { method: 'DELETE' });
    load();
    onChanged?.();
  }

  if (!data) {
    return <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-40 animate-pulse" />;
  }

  const hint = data.keyHints[provider];
  const providerLabel = data.providerLabels[provider] ?? provider;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Assistant</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Bring your own AI key and connect apps so the assistant can read your email, calendar, and
          social activity. Pick the model on the{' '}
          <a href="/agent/settings" className="text-purple-400 hover:text-purple-300">
            assistant settings page
          </a>
          .
        </p>
      </div>

      {!data.encryptionConfigured && (
        <p className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
          Server is missing APP_ENCRYPTION_KEY — keys and app connections are disabled until it&apos;s
          set.
        </p>
      )}

      {/* AI provider key */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">AI provider key</h3>
        <p className="text-xs text-zinc-500">
          Your own key — the assistant&apos;s usage is billed to you.
        </p>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="w-full bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
        >
          {Object.entries(data.providerLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {hint && (
          <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-1.5">
            <span className="text-xs text-zinc-300">Key set ••••{hint}</span>
            <button onClick={removeKey} className="text-[11px] text-zinc-500 hover:text-red-400">
              Remove
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`Paste your ${providerLabel} API key`}
            disabled={!data.encryptionConfigured}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <button
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim() || !data.encryptionConfigured}
            className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {savingKey ? 'Checking…' : hint ? 'Replace' : 'Add'}
          </button>
        </div>
      </div>

      {/* Connected apps */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-200">Connected apps</h3>
        {data.connections.length === 0 && (
          <p className="text-xs text-zinc-600">Nothing connected yet.</p>
        )}
        {data.connections.map((c) => (
          <div key={c.id} className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white">
                {c.provider === 'google' ? 'Google (Gmail + Calendar)' : c.provider}
                {c.account_email && <span className="text-zinc-500"> — {c.account_email}</span>}
              </span>
              <button
                onClick={() => disconnect(c.id)}
                className="text-[11px] text-zinc-500 hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
            <select
              value={c.autonomy}
              onChange={(e) => setAutonomy(c.id, e.target.value as Autonomy)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-purple-500"
            >
              {(Object.keys(AUTONOMY_LABELS) as Autonomy[]).map((a) => (
                <option key={a} value={a}>
                  {AUTONOMY_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
        ))}

        {data.googleConfigured ? (
          <a
            href="/api/agent/connect/google"
            className="inline-flex text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            + Connect Google (Gmail + Calendar)
          </a>
        ) : (
          <p className="text-[11px] text-zinc-600">
            Google connection is unavailable — the server needs <code>GOOGLE_CLIENT_ID</code> and{' '}
            <code>GOOGLE_CLIENT_SECRET</code>.
          </p>
        )}
      </div>

      {banner && (
        <p
          className={`text-[11px] rounded-lg px-3 py-2 ${
            banner.kind === 'ok'
              ? 'text-green-400 bg-green-950/40 border border-green-800'
              : 'text-red-400 bg-red-950/40 border border-red-800'
          }`}
        >
          {banner.text}
        </p>
      )}
    </div>
  );
}
