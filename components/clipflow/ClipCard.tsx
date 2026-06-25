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
};

const POST_STATUS_COLOR: Record<string, string> = {
  queued: 'text-zinc-400 border-zinc-700',
  scheduled: 'text-blue-400 border-blue-800',
  posting: 'text-purple-400 border-purple-800',
  posted: 'text-green-400 border-green-800',
  failed: 'text-red-400 border-red-800',
};

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      {/* Preview */}
      <div className="relative aspect-[9/16] bg-black">
        {clip.videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={clip.videoUrl} controls className="w-full h-full object-cover" />
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            title="clip preview"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">No preview</div>
        )}
        {clip.score != null && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold bg-purple-600/90 text-white px-2 py-0.5 rounded-full">
            {clip.score}
          </span>
        )}
        <span className="absolute top-2 right-2 text-[10px] bg-black/70 text-zinc-200 px-2 py-0.5 rounded-full">
          {fmtRange(clip.start_seconds, clip.end_seconds)}
        </span>
      </div>

      {/* Editor */}
      <div className="p-3 space-y-3 text-sm">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white font-medium placeholder-zinc-500 focus:outline-none focus:border-purple-500"
        />
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="On-screen caption / hook"
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-200 text-xs placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Post description"
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-400 text-xs placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="hashtags, comma, separated"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-purple-300 text-xs placeholder-zinc-500 focus:outline-none focus:border-purple-500"
        />

        {clip.reason && <p className="text-[11px] text-zinc-500 italic">{clip.reason}</p>}

        <div className="flex items-center gap-2">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as Clip['caption_style'])}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
          >
            <option value="opus">Opus captions</option>
            <option value="karaoke">Karaoke</option>
            <option value="minimal">Minimal</option>
          </select>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>

        {/* Render */}
        <button
          onClick={render}
          disabled={rendering}
          className="w-full text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {rendering ? 'Rendering 9:16…' : clip.videoUrl ? 'Re-render video' : 'Render 9:16 video'}
        </button>

        {/* Platform toggles */}
        <div className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(['instagram', 'tiktok', 'youtube', 'twitter'] as const).map((p) => {
              const connected = connectedPlatforms.includes(p);
              const on = selected.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => connected && toggle(p)}
                  disabled={!connected}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    on && connected
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : connected
                      ? 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                      : 'border-zinc-800 text-zinc-700 cursor-not-allowed'
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
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={post}
              disabled={posting}
              className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
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
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${POST_STATUS_COLOR[p.status] ?? 'text-zinc-400 border-zinc-700'}`}
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

        {msg && <p className="text-[11px] text-zinc-400">{msg}</p>}
        {clip.error && <p className="text-[11px] text-red-400">{clip.error}</p>}
      </div>
    </div>
  );
}
