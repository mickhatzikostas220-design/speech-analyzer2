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
    if (params.get('connected')) setBanner({ kind: 'ok', text: 'Gmail connected.' });
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

  if (!data) return <div className="max-w-2xl mx-auto px-4 py-10 text-zinc-500 text-sm">Loading…</div>;

  const modelsForProvider = data.modelOptions.filter((m) => m.provider === provider);
  const hint = data.keyHints[provider];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Agent settings</h1>
        <Link href="/agent" className="text-sm text-purple-400 hover:text-purple-300">
          ← Back to chat
        </Link>
      </div>

      {banner && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            banner.kind === 'ok'
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      {!data.encryptionConfigured && (
        <div className="text-sm rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300">
          Server is missing <code>APP_ENCRYPTION_KEY</code>. API keys and app connections are disabled
          until it&apos;s set in the environment.
        </div>
      )}

      {/* Model */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Model</h2>
        <p className="text-xs text-zinc-500">
          Choose your provider and model. You bring your own API key (below), so usage is billed to you.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as Provider);
              setModel('');
            }}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          >
            {Object.entries(data.providerLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
          >
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
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
          />
        )}
      </section>

      {/* API key */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">
          {data.providerLabels[provider]} API key
        </h2>
        {hint ? (
          <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
            <span className="text-sm text-zinc-300">Key set •••• {hint}</span>
            <button onClick={removeKey} className="text-xs text-red-400 hover:text-red-300">
              Remove
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No key set for this provider yet.</p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={`Paste your ${data.providerLabels[provider]} API key`}
            disabled={!data.encryptionConfigured}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 disabled:opacity-50"
          />
          <button
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim() || !data.encryptionConfigured}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white rounded-lg px-4 text-sm"
          >
            {savingKey ? 'Checking…' : hint ? 'Replace' : 'Add'}
          </button>
        </div>
      </section>

      {/* Connected apps */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Connected apps</h2>
        <p className="text-xs text-zinc-500">
          Connect apps so your agent can act on your behalf. You control how much each one is allowed to do.
        </p>

        {data.connections.length === 0 && (
          <p className="text-xs text-zinc-600">Nothing connected yet.</p>
        )}

        {data.connections.map((c) => (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white capitalize">
                {c.provider === 'google' ? 'Gmail' : c.provider}
                {c.account_email && (
                  <span className="text-zinc-500"> — {c.account_email}</span>
                )}
              </span>
              <button onClick={() => disconnect(c.id)} className="text-xs text-red-400 hover:text-red-300">
                Disconnect
              </button>
            </div>
            <select
              value={c.autonomy}
              onChange={(e) => setAutonomy(c.id, e.target.value as Autonomy)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300"
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
            className="inline-block text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-4 py-2"
          >
            + Connect Gmail
          </a>
        ) : (
          <p className="text-xs text-zinc-600">
            Gmail connection is unavailable — the server needs <code>GOOGLE_CLIENT_ID</code> and{' '}
            <code>GOOGLE_CLIENT_SECRET</code> configured.
          </p>
        )}
      </section>

      {/* Custom instructions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Custom instructions (optional)</h2>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Always keep emails under 120 words and sign off as Mick."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
        />
      </section>

      <button
        onClick={saveSettings}
        className="bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-5 py-2.5 text-sm"
      >
        Save settings
      </button>
    </div>
  );
}
