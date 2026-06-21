'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { Autonomy, Provider } from '@/lib/agent/types';

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelOption { provider: Provider; id: string; label: string }
interface Connection { id: string; provider: string; account_email: string | null; autonomy: Autonomy }
interface SettingsData {
  settings: { provider: Provider; model: string; system_prompt: string | null };
  keyHints: Record<string, string>;
  appKeyHints: Record<string, string>;
  connections: Connection[];
  modelOptions: ModelOption[];
  providerLabels: Record<string, string>;
  encryptionConfigured: boolean;
  googleConfigured: boolean;
  microsoftConfigured: boolean;
}

const AUTONOMY_LABELS: Record<Autonomy, string> = {
  read_only: 'Read only — search & read, never write',
  draft_confirm: 'Draft & confirm — creates drafts, never sends',
  act_directly: 'Act directly — can send / create on its own',
};

// ── App catalog ──────────────────────────────────────────────────────────────

interface OAuthApp {
  type: 'oauth';
  id: string;
  label: string;
  icon: string;
  description: string;
  connectPath: string;
  configuredKey: 'googleConfigured' | 'microsoftConfigured';
}

interface ApiKeyApp {
  type: 'apikey';
  id: string;
  label: string;
  icon: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  helpText: string;
}

type AppDef = OAuthApp | ApiKeyApp;

interface AppCategory {
  label: string;
  apps: AppDef[];
}

const APP_CATALOG: AppCategory[] = [
  {
    label: 'Email & Calendar',
    apps: [
      {
        type: 'oauth',
        id: 'google',
        label: 'Google Workspace',
        icon: 'G',
        description: 'Gmail · Google Calendar',
        connectPath: '/api/agent/connect/google',
        configuredKey: 'googleConfigured',
      },
      {
        type: 'oauth',
        id: 'microsoft',
        label: 'Microsoft 365',
        icon: 'M',
        description: 'Outlook Mail · Outlook Calendar',
        connectPath: '/api/agent/connect/microsoft',
        configuredKey: 'microsoftConfigured',
      },
    ],
  },
  {
    label: 'Social Media Analytics',
    apps: [
      {
        type: 'apikey',
        id: 'twitter',
        label: 'X / Twitter',
        icon: 'X',
        description: 'Follower count, tweet engagement, post metrics',
        keyLabel: 'Bearer token',
        keyPlaceholder: 'AAAAAAAAAAAAAAAA…',
        helpText: 'developer.twitter.com → Your App → Keys & Tokens → Bearer Token',
      },
      {
        type: 'apikey',
        id: 'instagram',
        label: 'Instagram',
        icon: 'IG',
        description: 'Followers, reach, impressions, recent post stats (Business/Creator required)',
        keyLabel: 'Graph API long-lived access token',
        keyPlaceholder: 'EAAGm0…',
        helpText: 'developers.facebook.com/tools/explorer → select Instagram Basic Display API',
      },
      {
        type: 'apikey',
        id: 'youtube',
        label: 'YouTube',
        icon: 'YT',
        description: 'Channel subscribers, views, video count',
        keyLabel: 'YouTube Data API v3 key',
        keyPlaceholder: 'AIzaSy…',
        helpText: 'console.cloud.google.com → APIs → YouTube Data API v3 → Credentials',
      },
      {
        type: 'apikey',
        id: 'linkedin',
        label: 'LinkedIn',
        icon: 'in',
        description: 'Profile info and headline',
        keyLabel: 'OAuth access token (r_liteprofile scope)',
        keyPlaceholder: 'AQV…',
        helpText: 'linkedin.com/developers → My Apps → OAuth 2.0 → Access token',
      },
      {
        type: 'apikey',
        id: 'facebook',
        label: 'Facebook Pages',
        icon: 'f',
        description: 'Page fans, followers, talking-about count',
        keyLabel: 'Page access token',
        keyPlaceholder: 'EAAGm0…',
        helpText: 'developers.facebook.com/tools/explorer → select your Page → generate Page token',
      },
      {
        type: 'apikey',
        id: 'tiktok',
        label: 'TikTok',
        icon: 'TT',
        description: 'Followers, following, total likes, video count',
        keyLabel: 'TikTok OAuth access token',
        keyPlaceholder: 'act.…',
        helpText: 'developers.tiktok.com → Manage Apps → OAuth token',
      },
    ],
  },
  {
    label: 'Productivity',
    apps: [
      {
        type: 'apikey',
        id: 'notion',
        label: 'Notion',
        icon: 'N',
        description: 'Search pages, read content, create pages',
        keyLabel: 'Internal integration token',
        keyPlaceholder: 'secret_…',
        helpText: 'notion.so/my-integrations → New integration → copy Internal Integration Token',
      },
      {
        type: 'apikey',
        id: 'slack',
        label: 'Slack',
        icon: 'S',
        description: 'List channels, search messages, post messages',
        keyLabel: 'Bot or user token (xoxb- or xoxp-)',
        keyPlaceholder: 'xoxb-…',
        helpText: 'api.slack.com/apps → Your App → OAuth & Permissions → Bot/User OAuth Token',
      },
      {
        type: 'apikey',
        id: 'dropbox',
        label: 'Dropbox',
        icon: '◈',
        description: 'List files, read text files, upload/save files',
        keyLabel: 'Access token',
        keyPlaceholder: 'sl.…',
        helpText: 'dropbox.com/developers/apps → Your App → Settings → Generated access token',
      },
      {
        type: 'apikey',
        id: 'airtable',
        label: 'Airtable',
        icon: '⊞',
        description: 'Read bases and records (coming soon)',
        keyLabel: 'Personal access token',
        keyPlaceholder: 'pat…',
        helpText: 'airtable.com/create/tokens → New token',
      },
      {
        type: 'apikey',
        id: 'hubspot',
        label: 'HubSpot',
        icon: 'H',
        description: 'Contacts, deals, notes (coming soon)',
        keyLabel: 'Private app token',
        keyPlaceholder: 'pat-na1-…',
        helpText: 'app.hubspot.com → Settings → Private Apps → Create app → Access token',
      },
    ],
  },
];

// ── Helper components ────────────────────────────────────────────────────────

function AppIcon({ label }: { label: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] text-xs font-bold text-strong"
      style={{ fontFamily: 'monospace' }}
    >
      {label}
    </div>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-[color:var(--success)]' : 'bg-[var(--border-subtle)]'}`}
    />
  );
}

// ── OAuthCard ────────────────────────────────────────────────────────────────

function OAuthCard({
  app,
  connections,
  configured,
  encryptionOk,
  onDisconnect,
  onAutonomy,
}: {
  app: OAuthApp;
  connections: Connection[];
  configured: boolean;
  encryptionOk: boolean;
  onDisconnect: (id: string) => void;
  onAutonomy: (id: string, a: Autonomy) => void;
}) {
  const matching = connections.filter((c) => c.provider === app.id);
  const connected = matching.length > 0;

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <AppIcon label={app.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-strong">{app.label}</span>
            <StatusDot connected={connected} />
          </div>
          <p className="mt-0.5 text-xs text-muted">{app.description}</p>
        </div>
      </div>

      {matching.length > 0 && (
        <div className="mt-3 space-y-2">
          {matching.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-strong">
                  {c.account_email ?? '(connected)'}
                </span>
                <button
                  onClick={() => onDisconnect(c.id)}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--danger)' }}
                >
                  Disconnect
                </button>
              </div>
              <select
                value={c.autonomy}
                onChange={(e) => onAutonomy(c.id, e.target.value as Autonomy)}
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
        </div>
      )}

      <div className="mt-3">
        {!encryptionOk ? (
          <p className="text-xs text-faint">
            Requires <code>APP_ENCRYPTION_KEY</code> to be configured on the server.
          </p>
        ) : !configured ? (
          <p className="text-xs text-faint">
            Requires{' '}
            {app.id === 'google'
              ? 'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET'
              : 'MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET'}{' '}
            in environment.
          </p>
        ) : (
          <a
            href={app.connectPath}
            className="btn-outline inline-flex text-xs"
            style={{ padding: '6px 14px' }}
          >
            {connected ? '+ Add another account' : '+ Connect'}
          </a>
        )}
      </div>
    </div>
  );
}

// ── ApiKeyCard ───────────────────────────────────────────────────────────────

function ApiKeyCard({
  app,
  hint,
  encryptionOk,
  onSave,
  onRemove,
}: {
  app: ApiKeyApp;
  hint: string | undefined;
  encryptionOk: boolean;
  onSave: (appId: string, key: string) => Promise<void>;
  onRemove: (appId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!input.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await onSave(app.id, input.trim());
      setInput('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <AppIcon label={app.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-strong">{app.label}</span>
            <StatusDot connected={!!hint} />
          </div>
          <p className="mt-0.5 text-xs text-muted">{app.description}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {hint ? (
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-2">
            <span className="text-xs text-strong">Key set •••• {hint}</span>
            <button
              onClick={() => onRemove(app.id)}
              className="text-xs font-semibold"
              style={{ color: 'var(--danger)' }}
            >
              Remove
            </button>
          </div>
        ) : null}

        {!encryptionOk ? (
          <p className="text-xs text-faint">
            Requires <code>APP_ENCRYPTION_KEY</code> on the server to store keys securely.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={hint ? `Replace ${app.keyLabel}` : app.keyPlaceholder}
                className="input flex-1 text-xs"
              />
              <button
                onClick={handleSave}
                disabled={saving || !input.trim()}
                className="btn-ink shrink-0 text-xs disabled:opacity-40"
                style={{ padding: '0 14px' }}
              >
                {saving ? '…' : hint ? 'Replace' : 'Save'}
              </button>
            </div>
            {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
            <p className="text-xs text-faint">{app.helpText}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── FilesCard ────────────────────────────────────────────────────────────────

function FilesCard() {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <AppIcon label="📁" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-strong">Local Files</span>
            <StatusDot connected={true} />
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Attach files from your computer to any chat message, or save agent output directly to disk.
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--surface-sunk)] px-3 py-2.5 text-xs text-muted">
        <strong className="text-strong">Read:</strong> click the <strong>📎</strong> button in the chat
        input to attach files — their contents are sent as context to the agent.
        <br />
        <strong className="mt-1 block text-strong">Write:</strong> click the <strong>↓</strong> button
        on any assistant message to save its content as a file on your computer.
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AgentSettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [tab, setTab] = useState<'settings' | 'apps'>('settings');

  // Settings tab state
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  // Handle OAuth redirect result and tab param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'apps') setTab('apps');

    if (params.get('connected') === 'google') {
      setBanner({ kind: 'ok', text: 'Google Workspace connected.' });
      setTab('apps');
    } else if (params.get('connected') === 'microsoft') {
      setBanner({ kind: 'ok', text: 'Microsoft 365 connected.' });
      setTab('apps');
    } else if (params.get('error')) {
      setBanner({ kind: 'err', text: `Connection failed: ${params.get('error')}` });
      setTab('apps');
    }

    if (params.get('connected') || params.get('error') || params.get('tab')) {
      window.history.replaceState({}, '', '/agent/settings');
    }
  }, []);

  // ── Settings tab actions ─────────────────────────────────────────────────

  async function saveSettings() {
    const chosenModel = model === '__custom__' ? customModel.trim() : model;
    if (!chosenModel) { setBanner({ kind: 'err', text: 'Choose or enter a model.' }); return; }
    const res = await fetch('/api/agent/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model: chosenModel, system_prompt: systemPrompt }),
    });
    setBanner(res.ok ? { kind: 'ok', text: 'Settings saved.' } : { kind: 'err', text: 'Could not save.' });
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
    if (res.ok) { setKeyInput(''); setBanner({ kind: 'ok', text: 'API key saved.' }); load(); }
    else setBanner({ kind: 'err', text: j.error || 'Could not save key.' });
  }

  async function removeKey() {
    await fetch(`/api/agent/keys?provider=${provider}`, { method: 'DELETE' });
    setBanner({ kind: 'ok', text: 'API key removed.' });
    load();
  }

  // ── Connected Apps tab actions ───────────────────────────────────────────

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
    setBanner({ kind: 'ok', text: 'Disconnected.' });
    load();
  }

  async function saveAppKey(appId: string, key: string) {
    const res = await fetch('/api/agent/app-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, key }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Could not save key.');
    setBanner({ kind: 'ok', text: `${appId} key saved.` });
    load();
  }

  async function removeAppKey(appId: string) {
    await fetch(`/api/agent/app-keys?appId=${appId}`, { method: 'DELETE' });
    setBanner({ kind: 'ok', text: `${appId} key removed.` });
    load();
  }

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted">Loading…</div>;

  const modelsForProvider = data.modelOptions.filter((m) => m.provider === provider);
  const hint = data.keyHints[provider];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Assistant</p>
          <h1 className="text-2xl font-extrabold text-strong">Agent settings</h1>
        </div>
        <Link href="/agent" className="text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
          ← Back to chat
        </Link>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'bg-[var(--success-bg)] text-[color:var(--success)]'
              : 'bg-[var(--danger-bg)] text-[color:var(--danger)]'
          }`}
        >
          {banner.text}
          <button
            onClick={() => setBanner(null)}
            className="ml-3 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-1">
        {(['settings', 'apps'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-[var(--radius-xs)] py-2 text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-surface-card text-strong shadow-sm'
                : 'text-muted hover:text-body'
            }`}
          >
            {t === 'settings' ? 'Settings' : 'Connected Apps'}
          </button>
        ))}
      </div>

      {/* ── Settings tab ──────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-8">
          {!data.encryptionConfigured && (
            <div className="rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[#8A6D00]">
              Server is missing <code>APP_ENCRYPTION_KEY</code>. API keys and connections are
              disabled until it is set.
            </div>
          )}

          {/* Model */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-strong">Model</h2>
            <p className="text-xs text-muted">
              Choose your AI provider and model. You supply the API key below.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={provider}
                onChange={(e) => { setProvider(e.target.value as Provider); setModel(''); }}
                className="input text-sm"
              >
                {Object.entries(data.providerLabels).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input text-sm">
                <option value="">Select a model…</option>
                {modelsForProvider.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                <option value="__custom__">Custom model ID…</option>
              </select>
            </div>
            {model === '__custom__' && (
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. gpt-4o or claude-opus-4-8"
                className="input w-full text-sm"
              />
            )}
          </section>

          {/* API key */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-strong">
              {data.providerLabels[provider]} API key
            </h2>
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
                className="btn-ink disabled:opacity-40"
                style={{ padding: '0 18px', fontSize: 'var(--text-sm)' }}
              >
                {savingKey ? 'Checking…' : hint ? 'Replace' : 'Add'}
              </button>
            </div>
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
      )}

      {/* ── Connected Apps tab ────────────────────────────────────────────── */}
      {tab === 'apps' && (
        <div className="space-y-8">
          {!data.encryptionConfigured && (
            <div className="rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[#8A6D00]">
              Server is missing <code>APP_ENCRYPTION_KEY</code>. Keys and OAuth tokens cannot be
              stored until it is set in your environment.
            </div>
          )}

          {APP_CATALOG.map((category) => (
            <section key={category.label} className="space-y-3">
              <h2 className="text-sm font-semibold text-strong">{category.label}</h2>
              <div className="space-y-3">
                {category.apps.map((app) => {
                  if (app.type === 'oauth') {
                    return (
                      <OAuthCard
                        key={app.id}
                        app={app}
                        connections={data.connections}
                        configured={data[app.configuredKey]}
                        encryptionOk={data.encryptionConfigured}
                        onDisconnect={disconnect}
                        onAutonomy={setAutonomy}
                      />
                    );
                  }
                  return (
                    <ApiKeyCard
                      key={app.id}
                      app={app}
                      hint={data.appKeyHints[app.id]}
                      encryptionOk={data.encryptionConfigured}
                      onSave={saveAppKey}
                      onRemove={removeAppKey}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {/* Files (browser-native, no key needed) */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-strong">Files</h2>
            <FilesCard />
          </section>
        </div>
      )}
    </div>
  );
}
