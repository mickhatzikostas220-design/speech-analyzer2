'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Autonomy, Provider } from '@/lib/agent/types';

interface ModelOption {
  provider: Provider;
  id: string;
  label: string;
}
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
  modelOptions: ModelOption[];
  providerLabels: Record<string, string>;
  encryptionConfigured: boolean;
  googleConfigured: boolean;
}

const AUTONOMY_LABELS: Record<Autonomy, string> = {
  read_only: 'Read only — can search & read, never write',
  draft_confirm: 'Draft & confirm — can create drafts, never sends',
  act_directly: 'Act directly — can send/act on its own',
};

export default function AgentSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/agent/settings');
    if (!res.ok) return;
    const d: SettingsData = await res.json();
    setData(d);
    setProvider(d.settings.provider);
    setSystemPrompt(d.settings.system_prompt ?? '');
    const known = d.modelOptions.some((m) => m.id === d.settings.model);
    setModel(known ? d.settings.model : '__custom__');
    setCustomModel(known ? '' : d.settings.model);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Surface OAuth redirect results.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setBanner({ kind: 'ok', text: 'Google connected (Gmail + Drive).' });
    else if (params.get('error'))
      setBanner({ kind: 'err', text: `Connection failed: ${params.get('error')}` });
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', '/agent/settings');
    }
  }, []);

  async function saveSettings() {
    const chosenModel = model === '__custom__' ? customModel.trim() : model;
    if (!chosenModel) {
      setBanner({ kind: 'err', text: 'Choose or enter a model.' });
      return;
    }
    const res = await fetch('/api/agent/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model: chosenModel, system_prompt: systemPrompt }),
    });
    setBanner(
      res.ok
        ? { kind: 'ok', text: 'Settings saved.' }
        : { kind: 'err', text: 'Could not save settings.' }
    );
    load();
  }

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSavingKey(true);
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
    } else {
      setBanner({ kind: 'err', text: j.error || 'Could not save key.' });
    }
  }

  async function removeKey() {
    await fetch(`/api/agent/keys?provider=${provider}`, { method: 'DELETE' });
    setBanner({ kind: 'ok', text: 'API key removed.' });
    load();
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
  }

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted">Loading…</div>;

  const modelsForProvider = data.modelOptions.filter((m) => m.provider === provider);
  const hint = data.keyHints[provider];

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Assistant</p>
          <h1 className="text-2xl font-extrabold text-strong">Agent settings</h1>
        </div>
        <Link href="/agent" className="text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
          ← Back to chat
        </Link>
      </div>

      {banner && (
        <div
          className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'bg-[var(--success-bg)] text-[color:var(--success)]'
              : 'bg-[var(--danger-bg)] text-[color:var(--danger)]'
          }`}
        >
          {banner.text}
        </div>
      )}

      {!data.encryptionConfigured && (
        <div className="rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[#8A6D00]">
          Server is missing <code>APP_ENCRYPTION_KEY</code>. API keys and app connections are disabled
          until it&apos;s set in the environment.
        </div>
      )}

      {/* Model */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">Model</h2>
        <p className="text-xs text-muted">
          Choose your provider and model. You bring your own API key (below), so usage is billed to you.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as Provider);
              setModel('');
            }}
            className="input text-sm"
          >
            {Object.entries(data.providerLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="input text-sm">
            <option value="">Select a model…</option>
            {modelsForProvider.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="__custom__">Custom model ID…</option>
          </select>
        </div>
        {model === '__custom__' && (
          <input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="e.g. a specific model id from your provider"
            className="input w-full text-sm"
          />
        )}
      </section>

      {/* API key */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">{data.providerLabels[provider]} API key</h2>
        {hint ? (
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-card px-3 py-2">
            <span className="text-sm text-strong">Key set •••• {hint}</span>
            <button onClick={removeKey} className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
              Remove
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted">No key set for this provider yet.</p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`Paste your ${data.providerLabels[provider]} API key`}
            disabled={!data.encryptionConfigured}
            className="input flex-1 text-sm disabled:opacity-50"
          />
          <button
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim() || !data.encryptionConfigured}
            className="btn-ink"
            style={{ padding: '0 18px', fontSize: 'var(--text-sm)' }}
          >
            {savingKey ? 'Checking…' : hint ? 'Replace' : 'Add'}
          </button>
        </div>
      </section>

      {/* Connected apps */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">Connected apps</h2>
        <p className="text-xs text-muted">
          Connect apps so your agent can act on your behalf. You control how much each one is allowed to do.
        </p>

        {data.connections.length === 0 && <p className="text-xs text-faint">Nothing connected yet.</p>}

        {data.connections.map((c) => (
          <div key={c.id} className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-card px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm capitalize text-strong">
                {c.provider === 'google' ? 'Google — Gmail & Drive' : c.provider}
                {c.account_email && <span className="text-muted"> — {c.account_email}</span>}
              </span>
              <button onClick={() => disconnect(c.id)} className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
                Disconnect
              </button>
            </div>
            <select
              value={c.autonomy}
              onChange={(e) => setAutonomy(c.id, e.target.value as Autonomy)}
              className="input w-full text-xs"
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
          <a href="/api/agent/connect/google" className="btn-outline inline-flex" style={{ padding: '8px 18px', fontSize: 'var(--text-sm)' }}>
            + Connect Google (Gmail &amp; Drive)
          </a>
        ) : (
          <p className="text-xs text-faint">
            Google connection is unavailable — the server needs <code>GOOGLE_CLIENT_ID</code> and{' '}
            <code>GOOGLE_CLIENT_SECRET</code> configured.
          </p>
        )}
      </section>

      {/* Custom instructions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">Custom instructions (optional)</h2>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Always keep emails under 120 words and sign off as Mick."
          className="input w-full text-sm"
        />
      </section>

      <button onClick={saveSettings} className="btn-primary">
        Save settings
      </button>
    </div>
  );
}
