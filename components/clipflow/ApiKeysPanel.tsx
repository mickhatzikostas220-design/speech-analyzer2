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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-4 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-white">Your API keys</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Bring your own keys — clip AI and publishing run on your accounts. Optional; the app
            defaults are used otherwise.
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-zinc-800 pt-4">
          {disabled && (
            <p className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-900 rounded-lg px-3 py-2">
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
              <h3 className="text-sm font-medium text-zinc-200">Per-platform app credentials</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Advanced: connect a platform directly with your own developer app (client id &amp;
                secret) instead of Upload-Post.
              </p>
            </div>
            {PLATFORMS.map((p) => {
              const k = `oauth_${p}`;
              const set = hints[k];
              return (
                <div key={p} className="bg-zinc-950/40 border border-zinc-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white">{PLATFORM_LABELS[p]}</span>
                    {set ? (
                      <button
                        onClick={() => remove(k)}
                        disabled={busy === k}
                        className="text-[11px] text-zinc-500 hover:text-red-400 disabled:opacity-50"
                      >
                        Remove (client ••••{set})
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-600">Not set</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Client ID"
                      value={oauth[p].id}
                      disabled={disabled}
                      onChange={(e) => setOauth((o) => ({ ...o, [p]: { ...o[p], id: e.target.value } }))}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <input
                      type="password"
                      placeholder="Client secret"
                      value={oauth[p].secret}
                      disabled={disabled}
                      onChange={(e) =>
                        setOauth((o) => ({ ...o, [p]: { ...o[p], secret: e.target.value } }))
                      }
                      className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={() => saveOAuth(p)}
                    disabled={disabled || busy === k || !oauth[p].id.trim() || !oauth[p].secret.trim()}
                    className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {busy === k ? 'Saving…' : set ? 'Replace' : 'Save'}
                  </button>
                </div>
              );
            })}
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
        <h3 className="text-sm font-medium text-zinc-200">{props.label}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{props.help}</p>
      </div>
      {props.hint && (
        <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800 rounded-lg px-3 py-1.5">
          <span className="text-xs text-zinc-300">Key set ••••{props.hint}</span>
          <button
            onClick={props.onRemove}
            disabled={props.busy}
            className="text-[11px] text-zinc-500 hover:text-red-400 disabled:opacity-50"
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
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
        />
        <button
          onClick={props.onSave}
          disabled={props.disabled || props.busy || !props.value.trim()}
          className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {props.busy ? 'Checking…' : props.hint ? 'Replace' : 'Add'}
        </button>
      </div>
    </div>
  );
}
