'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CLIP_LENGTHS, CLIP_LENGTH_LABELS, type ClipLength } from '@/lib/clipflow/types';

const TONE_SUGGESTIONS = ['Funny', 'Educational', 'Inspirational', 'High-energy', 'Storytelling', 'Controversial'];

interface ProjectSummary {
  id: string;
  source_url: string;
  source_type: 'video' | 'channel';
  title: string | null;
  channel_title: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: string;
  progress: number;
  error: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'text-zinc-400',
  fetching: 'text-blue-400',
  transcribing: 'text-blue-400',
  analyzing: 'text-purple-400',
  clipping: 'text-purple-400',
  ready: 'text-green-400',
  error: 'text-red-400',
};

function fmtDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ClipFlowPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clip preferences — what kind of clips the user is looking for.
  const [showPrefs, setShowPrefs] = useState(false);
  const [tone, setTone] = useState('');
  const [length, setLength] = useState<ClipLength>('any');
  const [notes, setNotes] = useState('');

  function load() {
    fetch('/api/clipflow')
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const preferences = {
        tone: tone.trim() || undefined,
        length: length !== 'any' ? length : undefined,
        notes: notes.trim() || undefined,
      };
      const hasPrefs = preferences.tone || preferences.length || preferences.notes;
      const res = await fetch('/api/clipflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ...(hasPrefs ? { preferences } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/clipflow/${data.id}`);
      } else {
        setError(data.error || 'Something went wrong.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProject(id: string) {
    await fetch(`/api/clipflow/${id}`, { method: 'DELETE' });
    setProjects((p) => p.filter((proj) => proj.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-white">ClipFlow</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Paste a YouTube video or channel — get scroll-stopping vertical clips with AI titles,
          captions, and hashtags, ready to post.
        </p>
      </div>

      {/* URL input */}
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=…  or  youtube.com/@channel"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !url.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
          >
            {submitting ? 'Starting…' : 'Generate clips'}
          </button>
        </div>

        {/* Clip preferences — tone, length, and free-form notes */}
        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${showPrefs ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Preferences &amp; notes
          {(tone.trim() || length !== 'any' || notes.trim()) && (
            <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-purple-500" aria-hidden />
          )}
        </button>

        {showPrefs && (
          <div className="space-y-4 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500">
              Tell ClipFlow what you&apos;re looking for. These guide which moments it picks and how long
              the clips are.
            </p>

            {/* Length */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Clip length</label>
              <div className="flex flex-wrap gap-2">
                {CLIP_LENGTHS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLength(l)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      length === l
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {CLIP_LENGTH_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <label htmlFor="cf-tone" className="text-xs font-medium text-zinc-300">
                Tone / style
              </label>
              <input
                id="cf-tone"
                type="text"
                placeholder="e.g. funny, educational, inspirational…"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                maxLength={200}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TONE_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className="text-[11px] px-2 py-1 rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="cf-notes" className="text-xs font-medium text-zinc-300">
                Notes
              </label>
              <textarea
                id="cf-notes"
                rows={3}
                placeholder="Anything else? e.g. “focus on the startup advice, skip the intro, pull quotable one-liners.”"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={600}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </form>

      {/* Connect accounts & API keys live in shared Settings */}
      <Link
        href="/settings/connections"
        className="flex items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-white">Connect accounts &amp; API keys →</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Add your OpenAI / Upload-Post keys and connect TikTok, Instagram, YouTube &amp; X to post
            clips — managed in Settings.
          </p>
        </div>
        <svg className="w-5 h-5 text-zinc-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Projects */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Your videos</h2>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-24 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/40 border border-zinc-800 rounded-xl">
            <svg className="w-10 h-10 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-zinc-600">No videos yet — paste a YouTube link above to begin.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-4 hover:border-zinc-700 transition-colors"
              >
                <button onClick={() => router.push(`/clipflow/${p.id}`)} className="flex items-center gap-4 flex-1 text-left min-w-0">
                  <div className="w-24 h-14 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
                    {p.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">
                      {p.title || p.source_url}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-zinc-500'}`}>
                        {p.status === 'ready' ? 'Ready' : p.status}
                        {['fetching', 'transcribing', 'analyzing', 'clipping'].includes(p.status)
                          ? ` · ${p.progress}%`
                          : ''}
                      </span>
                      {fmtDuration(p.duration_seconds) && (
                        <span className="text-xs text-zinc-600">{fmtDuration(p.duration_seconds)}</span>
                      )}
                      <span className="text-xs text-zinc-600">{timeAgo(p.created_at)}</span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  className="p-1 text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                  aria-label="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
