'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Provider } from '@/lib/agent/types';

interface ModelOption {
  provider: Provider;
  id: string;
  label: string;
}
interface SettingsData {
  settings: { provider: Provider; model: string; system_prompt: string | null };
  modelOptions: ModelOption[];
  providerLabels: Record<string, string>;
  encryptionConfigured: boolean;
}

export default function AgentSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

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

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted">Loading…</div>;

  const modelsForProvider = data.modelOptions.filter((m) => m.provider === provider);

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

      {/* Model */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">Model</h2>
        <p className="text-xs text-muted">
          Choose your provider and model. You bring your own API key, so usage is billed to you.
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

      {/* API keys & connected apps — managed in shared Settings */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-strong">API key &amp; connected apps</h2>
        <p className="text-xs text-muted">
          Your AI provider key and connected apps (Gmail, Calendar, and social) are managed in one
          shared place — used by both the assistant and ClipFlow.
        </p>
        <Link
          href="/settings/connections"
          className="card flex items-center justify-between gap-4 p-4 transition hover:border-strong"
        >
          <div>
            <p className="font-bold text-strong">Connections &amp; API keys →</p>
            <p className="text-sm text-muted">Add your API key and connect apps.</p>
          </div>
        </Link>
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
