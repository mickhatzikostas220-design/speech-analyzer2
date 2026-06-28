'use client';

import { useEffect, useState } from 'react';

type Platform = 'youtube' | 'tiktok' | 'instagram' | 'twitter';

interface KeysData {
  hints: Record<string, string>;
  encryptionConfigured: boolean;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
};

const PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'twitter'];

// Shared compact input styling, mapped to the brand design tokens.
const INPUT_CLS =
  'rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-xs text-strong placeholder:text-[var(--text-faint)] focus:border-[color:var(--signature)] focus:outline-none disabled:opacity-50';

// Lets each user bring their own ClipFlow API keys: OpenAI (clip AI), Upload-Post
// (publish under their own account), and per-platform OAuth client credentials
// for the direct-posting path. Keys are encrypted server-side; only a 4-char
// hint is ever returned.
export function ApiKeysPanel({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<KeysData | null>(null);
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Simple-key inputs.
  const [openaiKey, setOpenaiKey] = useState('');
  const [uploadPostKey, setUploadPostKey] = useState('');
  // Per-platform OAuth inputs.
  const [oauth, setOauth] = useState<Record<Platform, { id: string; secret: string }>>({
    youtube: { id: '', secret: '' },
    tiktok: { id: '', secret: '' },
    instagram: { id: '', secret: '' },
    twitter: { id: '', secret: '' },
  });

  async function load() {
    try {
      const res = await fetch('/api/clipflow/keys');
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  const hints = data?.hints ?? {};
  const disabled = data ? !data.encryptionConfigured : false;

  async function saveSimple(kind: 'openai' | 'upload_post', key: string, clear: () => void) {
    if (!key.trim()) return;
    setBusy(kind);
    setBanner(null);
    try {
      const res = await fetch('/api/clipflow/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, key: key.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        clear();
        setBanner({ kind: 'ok', text: 'Key saved.' });
        await load();
        onChanged?.();
      } else {
        setBanner({ kind: 'err', text: j.error || 'Could not save key.' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveOAuth(platform: Platform) {
    const creds = oauth[platform];
    if (!creds.id.trim() || !creds.secret.trim()) return;
    setBusy(`oauth_${platform}`);
    setBanner(null);
    try {
      const res = await fetch('/api/clipflow/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: `oauth_${platform}`,
          clientId: creds.id.trim(),
          clientSecret: creds.secret.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setOauth((o) => ({ ...o, [platform]: { id: '', secret: '' } }));
        setBanner({ kind: 'ok', text: `${PLATFORM_LABELS[platform]} app credentials saved.` });
        await load();
        onChanged?.();
      } else {
        setBanner({ kind: 'err', text: j.error || 'Could not save credentials.' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: string) {
    setBusy(kind);
    setBanner(null);
    try {
      await fetch(`/api/clipflow/keys?kind=${kind}`, { method: 'DELETE' });
      setBanner({ kind: 'ok', text: 'Key removed.' });
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-strong">Your API keys</h2>
          <p className="mt-0.5 text-xs text-muted">
            Bring your own keys — clip AI and publishing run on your accounts. Optional; the app
            defaults are used otherwise.
          </p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-5 border-t border-[var(--border-subtle)] px-4 pb-4 pt-4">
          {disabled && (
            <p className="rounded-[var(--radius-sm)] border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-[11px] text-[#8A6D00]">
              Server is missing APP_ENCRYPTION_KEY — keys can&apos;t be stored securely until it&apos;s
              set.
            </p>
          )}

          {/* OpenAI */}
          <KeyRow
            label="OpenAI API key"
            help="Powers clip moment-detection, titles, captions & hashtags (GPT-4o). Billed to your OpenAI account."
            hint={hints.openai}
            value={openaiKey}
            onChange={setOpenaiKey}
            onSave={() => saveSimple('openai', openaiKey, () => setOpenaiKey(''))}
            onRemove={() => remove('openai')}
            placeholder="sk-…"
            busy={busy === 'openai'}
            disabled={disabled}
          />

          {/* Upload-Post */}
          <KeyRow
            label="Upload-Post API key"
            help="Post clips straight to TikTok, Instagram, YouTube & X under your own Upload-Post account."
            hint={hints.upload_post}
            value={uploadPostKey}
            onChange={setUploadPostKey}
            onSave={() => saveSimple('upload_post', uploadPostKey, () => setUploadPostKey(''))}
            onRemove={() => remove('upload_post')}
            placeholder="Upload-Post API key"
            busy={busy === 'upload_post'}
            disabled={disabled}
          />

          {/* Per-platform OAuth apps */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-strong">Per-platform app credentials</h3>
              <p className="mt-0.5 text-xs text-muted">
                Advanced: connect a platform directly with your own developer app (client id &amp;
                secret) instead of Upload-Post.
              </p>
            </div>
            {PLATFORMS.map((p) => {
              const k = `oauth_${p}`;
              const set = hints[k];
              return (
                <div key={p} className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-strong">{PLATFORM_LABELS[p]}</span>
                    {set ? (
                      <button
                        onClick={() => remove(k)}
                        disabled={busy === k}
                        className="text-[11px] text-muted hover:text-[color:var(--danger)] disabled:opacity-50"
                      >
                        Remove (client ••••{set})
                      </button>
                    ) : (
                      <span className="text-[10px] text-faint">Not set</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Client ID"
                      value={oauth[p].id}
                      disabled={disabled}
                      onChange={(e) => setOauth((o) => ({ ...o, [p]: { ...o[p], id: e.target.value } }))}
                      className={INPUT_CLS}
                    />
                    <input
                      type="password"
                      placeholder="Client secret"
                      value={oauth[p].secret}
                      disabled={disabled}
                      onChange={(e) =>
                        setOauth((o) => ({ ...o, [p]: { ...o[p], secret: e.target.value } }))
                      }
                      className={INPUT_CLS}
                    />
                  </div>
                  <button
                    onClick={() => saveOAuth(p)}
                    disabled={disabled || busy === k || !oauth[p].id.trim() || !oauth[p].secret.trim()}
                    className="btn-outline text-[11px]"
                    style={{ padding: '6px 12px' }}
                  >
                    {busy === k ? 'Saving…' : set ? 'Replace' : 'Save'}
                  </button>
                </div>
              );
            })}
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
      )}
    </div>
  );
}

function KeyRow(props: {
  label: string;
  help: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  placeholder: string;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium text-strong">{props.label}</h3>
        <p className="mt-0.5 text-xs text-muted">{props.help}</p>
      </div>
      {props.hint && (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] px-3 py-1.5">
          <span className="text-xs text-body">Key set ••••{props.hint}</span>
          <button
            onClick={props.onRemove}
            disabled={props.busy}
            className="text-[11px] text-muted hover:text-[color:var(--danger)] disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="password"
          value={props.value}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className={`${INPUT_CLS} flex-1`}
        />
        <button
          onClick={props.onSave}
          disabled={props.disabled || props.busy || !props.value.trim()}
          className="btn-primary whitespace-nowrap text-xs"
          style={{ padding: '8px 16px' }}
        >
          {props.busy ? 'Checking…' : props.hint ? 'Replace' : 'Add'}
        </button>
      </div>
    </div>
  );
}
