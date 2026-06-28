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
    return <div className="h-40 animate-pulse rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)]" />;
  }

  const hint = data.keyHints[provider];
  const providerLabel = data.providerLabels[provider] ?? provider;

  return (
    <div className="card space-y-5 p-4">
      <div>
        <h2 className="text-base font-semibold text-strong">Assistant</h2>
        <p className="mt-0.5 text-xs text-muted">
          Bring your own AI key and connect apps so the assistant can read your email, calendar, and
          social activity. Pick the model on the{' '}
          <a href="/agent/settings" className="hover:underline" style={{ color: 'var(--text-link)' }}>
            assistant settings page
          </a>
          .
        </p>
      </div>

      {!data.encryptionConfigured && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[#8A6D00]">
          Server is missing APP_ENCRYPTION_KEY — keys and app connections are disabled until it&apos;s
          set.
        </p>
      )}

      {/* AI provider key */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-strong">AI provider key</h3>
        <p className="text-xs text-muted">
          Your own key — the assistant&apos;s usage is billed to you.
        </p>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-xs text-strong focus:border-[color:var(--signature)] focus:outline-none"
        >
          {Object.entries(data.providerLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {hint && (
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] px-3 py-1.5">
            <span className="text-xs text-body">Key set ••••{hint}</span>
            <button onClick={removeKey} className="text-[11px] text-muted hover:text-[color:var(--danger)]">
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
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-xs text-strong placeholder:text-[var(--text-faint)] focus:border-[color:var(--signature)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim() || !data.encryptionConfigured}
            className="btn-primary whitespace-nowrap text-xs"
            style={{ padding: '8px 16px' }}
          >
            {savingKey ? 'Checking…' : hint ? 'Replace' : 'Add'}
          </button>
        </div>
      </div>

      {/* Connected apps */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-strong">Connected apps</h3>
        {data.connections.length === 0 && (
          <p className="text-xs text-faint">Nothing connected yet.</p>
        )}
        {data.connections.map((c) => (
          <div key={c.id} className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-strong">
                {c.provider === 'google' ? 'Google (Gmail + Calendar)' : c.provider}
                {c.account_email && <span className="text-muted"> — {c.account_email}</span>}
              </span>
              <button
                onClick={() => disconnect(c.id)}
                className="text-[11px] text-muted hover:text-[color:var(--danger)]"
              >
                Disconnect
              </button>
            </div>
            <select
              value={c.autonomy}
              onChange={(e) => setAutonomy(c.id, e.target.value as Autonomy)}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-[11px] text-strong focus:border-[color:var(--signature)] focus:outline-none"
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
            className="btn-outline inline-flex text-xs"
            style={{ padding: '8px 16px' }}
          >
            + Connect Google (Gmail + Calendar)
          </a>
        ) : (
          <p className="text-[11px] text-faint">
            Google connection is unavailable — the server needs <code>GOOGLE_CLIENT_ID</code> and{' '}
            <code>GOOGLE_CLIENT_SECRET</code>.
          </p>
        )}
      </div>

      {banner && (
        <p
          className={`rounded-[var(--radius-sm)] px-3 py-2 text-[11px] ${
            banner.kind === 'ok'
              ? 'border border-[color:var(--success)]/40 bg-[var(--success-bg)] text-[color:var(--success)]'
              : 'border border-[color:var(--danger)]/40 bg-[var(--danger-bg)] text-[color:var(--danger)]'
          }`}
        >
          {banner.text}
        </p>
      )}
    </div>
  );
}
