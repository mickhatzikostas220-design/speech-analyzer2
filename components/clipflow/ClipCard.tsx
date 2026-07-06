'use client';

import { useState } from 'react';

export interface ClipPost {
  platform: string;
  status: string;
  external_url: string | null;
  error: string | null;
}

export interface Clip {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string | null;
  caption: string | null;
  description: string | null;
  hashtags: Record<string, string[]>;
  score: number | null;
  reason: string | null;
  caption_style: 'opus' | 'karaoke' | 'minimal';
  status: string;
  file_path: string | null;
  thumbnail_url: string | null;
  videoUrl: string | null;
  error: string | null;
  posts: ClipPost[];
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
};

const POST_STATUS_COLOR: Record<string, string> = {
  queued: 'text-muted border-[var(--border-default)]',
  scheduled: 'text-[color:var(--info)] border-[color:var(--info)]/40',
  posting: 'text-[color:var(--accent-2)] border-[color:var(--accent-2)]/40',
  posted: 'text-[color:var(--success)] border-[color:var(--success)]/40',
  failed: 'text-[color:var(--danger)] border-[color:var(--danger)]/40',
};

// Shared compact input styling, tuned to the dense clip-editor layout.
const INPUT_CLS =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-2 py-1.5 placeholder:text-[var(--text-faint)] focus:border-[color:var(--signature)] focus:outline-none';

function fmtRange(start: number, end: number) {
  const f = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  return `${f(start)}–${f(end)} · ${Math.round(end - start)}s`;
}

export function ClipCard({
  clip,
  youtubeId,
  connectedPlatforms,
  onChange,
}: {
  clip: Clip;
  youtubeId: string | null;
  connectedPlatforms: string[];
  onChange: (updated: Partial<Clip>) => void;
}) {
  const [title, setTitle] = useState(clip.title ?? '');
  const [caption, setCaption] = useState(clip.caption ?? '');
  const [description, setDescription] = useState(clip.description ?? '');
  const [tags, setTags] = useState((clip.hashtags?.default ?? []).join(', '));
  const [style, setStyle] = useState(clip.caption_style);

  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>(connectedPlatforms);
  const [scheduledAt, setScheduledAt] = useState('');

  function toggle(platform: string) {
    setSelected((s) => (s.includes(platform) ? s.filter((p) => p !== platform) : [...s, platform]));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const hashtags = { ...clip.hashtags, default: tags.split(',').map((t) => t.replace(/^#/, '').trim()).filter(Boolean) };
    try {
      const res = await fetch(`/api/clipflow/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, caption, description, hashtags, caption_style: style }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      onChange({ title, caption, description, hashtags, caption_style: style });
      setMsg('Saved');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/clipflow/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regenerate failed');
      setTitle(data.title ?? '');
      setCaption(data.caption ?? '');
      setDescription(data.description ?? '');
      setTags((data.hashtags?.default ?? []).join(', '));
      onChange(data);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Regenerate failed');
    } finally {
      setRegenerating(false);
    }
  }

  async function render() {
    setRendering(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/clipflow/clips/${clip.id}/render`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');
      onChange({ status: 'ready', videoUrl: data.videoUrl, file_path: 'rendered' });
      setMsg('Rendered');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Render failed');
      onChange({ status: 'error' });
    } finally {
      setRendering(false);
    }
  }

  async function post() {
    if (selected.length === 0) {
      setMsg('Select at least one platform.');
      return;
    }
    setPosting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/clipflow/clips/${clip.id}/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: selected, scheduledAt: scheduledAt || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Post failed');
      onChange({ posts: data.posts });
      setMsg(scheduledAt ? 'Scheduled' : 'Sent to platforms');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Post failed');
    } finally {
      setPosting(false);
    }
  }

  const embedUrl = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?start=${Math.floor(clip.start_seconds)}&end=${Math.ceil(clip.end_seconds)}&rel=0`
    : null;

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Preview */}
      <div className="relative aspect-[9/16] bg-black">
        {clip.videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={clip.videoUrl} controls className="h-full w-full object-cover" />
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            className="h-full w-full"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            title="clip preview"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/60">No preview</div>
        )}
        {clip.score != null && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--signature)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--on-signature)]">
            {clip.score}
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/90">
          {fmtRange(clip.start_seconds, clip.end_seconds)}
        </span>
      </div>

      {/* Editor */}
      <div className="space-y-3 p-3 text-sm">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className={`${INPUT_CLS} font-medium text-strong`}
        />
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="On-screen caption / hook"
          rows={2}
          className={`${INPUT_CLS} resize-none text-xs text-body`}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Post description"
          rows={2}
          className={`${INPUT_CLS} resize-none text-xs text-muted`}
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="hashtags, comma-separated"
          className={`${INPUT_CLS} text-xs text-[color:var(--accent-2)]`}
        />

        {clip.reason && <p className="text-[11px] italic text-muted">{clip.reason}</p>}

        <div className="flex items-center gap-2">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as Clip['caption_style'])}
            className={`${INPUT_CLS} w-auto text-xs text-body`}
          >
            <option value="opus">Opus captions</option>
            <option value="karaoke">Karaoke</option>
            <option value="minimal">Minimal</option>
          </select>
          <button
            onClick={save}
            disabled={saving}
            className="btn-outline text-xs"
            style={{ padding: '6px 12px' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="text-xs transition-colors hover:underline disabled:opacity-50"
            style={{ color: 'var(--text-link)' }}
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>

        {/* Render */}
        <button
          onClick={render}
          disabled={rendering}
          className="btn-outline w-full text-xs"
          style={{ padding: '8px 12px' }}
        >
          {rendering ? 'Rendering 9:16…' : clip.videoUrl ? 'Re-render video' : 'Render 9:16 video'}
        </button>

        {/* Platform toggles */}
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex flex-wrap gap-1.5">
            {(['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook'] as const).map((p) => {
              const connected = connectedPlatforms.includes(p);
              const on = selected.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => connected && toggle(p)}
                  disabled={!connected}
                  className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${
                    on && connected
                      ? 'border-[color:var(--signature)] bg-[var(--signature)] text-[color:var(--on-signature)]'
                      : connected
                      ? 'border-[var(--border-default)] text-muted hover:border-strong'
                      : 'cursor-not-allowed border-[var(--border-subtle)] text-faint'
                  }`}
                  title={connected ? '' : 'Connect this platform first'}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={`${INPUT_CLS} flex-1 text-[11px] text-body`}
            />
            <button
              onClick={post}
              disabled={posting}
              className="btn-primary whitespace-nowrap text-xs"
              style={{ padding: '6px 16px' }}
            >
              {posting ? 'Posting…' : scheduledAt ? 'Schedule' : 'Post now'}
            </button>
          </div>

          {/* Post status */}
          {clip.posts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {clip.posts.map((p, i) => (
                <span
                  key={`${p.platform}-${i}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${POST_STATUS_COLOR[p.status] ?? 'text-muted border-[var(--border-default)]'}`}
                  title={p.error ?? ''}
                >
                  {PLATFORM_LABELS[p.platform] ?? p.platform}: {p.status}
                  {p.external_url && (
                    <>
                      {' '}
                      <a href={p.external_url} target="_blank" rel="noreferrer" className="underline">
                        view
                      </a>
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {msg && <p className="text-[11px] text-muted">{msg}</p>}
        {clip.error && <p className="text-[11px] text-[color:var(--danger)]">{clip.error}</p>}
      </div>
    </div>
  );
}
