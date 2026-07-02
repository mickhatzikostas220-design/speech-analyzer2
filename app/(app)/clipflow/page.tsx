'use client';

import { useEffect, useRef, useState } from 'react';
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
  queued: 'text-muted',
  fetching: 'text-[color:var(--info)]',
  transcribing: 'text-[color:var(--info)]',
  analyzing: 'text-[color:var(--accent-2)]',
  clipping: 'text-[color:var(--accent-2)]',
  ready: 'text-[color:var(--success)]',
  error: 'text-[color:var(--danger)]',
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
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Clip preferences — what kind of clips the user is looking for.
  const [showPrefs, setShowPrefs] = useState(false);
  const [tone, setTone] = useState('');
  const [length, setLength] = useState<ClipLength>('any');
  const [notes, setNotes] = useState('');

  function load() {
    setLoadError(false);
    fetch('/api/clipflow')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  // Close the delete-confirmation modal on Escape, and move focus onto Cancel
  // when it opens — standard a11y for a destructive dialog, so keyboard/screen-
  // reader users aren't left focused on the page behind it.
  useEffect(() => {
    if (!deleteTarget) return;
    cancelBtnRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDeleteTarget(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget]);

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

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setProjects((p) => p.filter((proj) => proj.id !== target.id));
    await fetch(`/api/clipflow/${target.id}`, { method: 'DELETE' });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <div>
        <p className="eyebrow mb-1">ClipFlow</p>
        <h1 className="display-h1" style={{ fontSize: 'var(--text-h3)' }}>Turn long videos into clips</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a YouTube video or channel — get scroll-stopping vertical clips with AI titles,
          captions, and hashtags, ready to post.
        </p>
      </div>

      {/* URL input */}
      <form onSubmit={submit} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=…  or  youtube.com/@channel"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input flex-1 text-sm"
          />
          <button type="submit" disabled={submitting || !url.trim()} className="btn-primary whitespace-nowrap">
            {submitting ? 'Starting…' : 'Generate clips'}
          </button>
        </div>

        {/* Clip preferences — tone, length, and free-form notes */}
        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-strong"
        >
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showPrefs ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Preferences &amp; notes
          {(tone.trim() || length !== 'any' || notes.trim()) && (
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--signature)]" aria-hidden />
          )}
        </button>

        {showPrefs && (
          <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-4">
            <p className="text-xs text-muted">
              Tell ClipFlow what you&apos;re looking for. These guide which moments it picks and how long
              the clips are.
            </p>

            {/* Length */}
            <div className="space-y-1.5">
              <label className="field-label" style={{ marginBottom: 0 }}>Clip length</label>
              <div className="flex flex-wrap gap-2">
                {CLIP_LENGTHS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLength(l)}
                    className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-xs transition-colors ${
                      length === l
                        ? 'border-[color:var(--signature)] bg-[var(--signature)] text-[color:var(--on-signature)]'
                        : 'border-[var(--border-default)] bg-surface-card text-muted hover:border-strong'
                    }`}
                  >
                    {CLIP_LENGTH_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <label htmlFor="cf-tone" className="field-label" style={{ marginBottom: 0 }}>
                Tone / style
              </label>
              <input
                id="cf-tone"
                type="text"
                placeholder="e.g. funny, educational, inspirational…"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                maxLength={200}
                className="input w-full text-sm"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {TONE_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className="rounded-md bg-[var(--surface-sunk)] px-2 py-1 text-[11px] text-muted transition-colors hover:text-strong"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label htmlFor="cf-notes" className="field-label" style={{ marginBottom: 0 }}>
                Notes
              </label>
              <textarea
                id="cf-notes"
                rows={3}
                placeholder="Anything else? e.g. “focus on the startup advice, skip the intro, pull quotable one-liners.”"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={600}
                className="input w-full resize-none text-sm"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-xs" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </form>

      {/* Connect accounts & API keys live in shared Settings */}
      <Link
        href="/settings/connections"
        className="card flex items-center justify-between gap-4 p-4 transition-colors hover:border-strong"
      >
        <div>
          <p className="text-sm font-semibold text-strong">Connect accounts &amp; API keys →</p>
          <p className="mt-0.5 text-xs text-muted">
            Add your OpenAI / Upload-Post keys and connect TikTok, Instagram, YouTube &amp; X to post
            clips — managed in Settings.
          </p>
        </div>
        <svg className="h-5 w-5 shrink-0 text-[var(--ink-400)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Projects */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-strong">Your videos</h2>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] py-16 text-center">
            <p className="text-sm text-muted">We couldn&apos;t load your videos. Check your connection and try again.</p>
            <button onClick={() => { setLoading(true); load(); }} className="mt-3 text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
              Retry
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] py-16 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-[var(--ink-300)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-faint">No videos yet — paste a YouTube link above to begin.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="card flex items-center gap-4 p-3 transition-colors hover:border-strong"
              >
                <button onClick={() => router.push(`/clipflow/${p.id}`)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-sunk)]">
                    {p.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-strong">
                      {p.title || p.source_url}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-muted'}`}>
                        {p.status === 'ready' ? 'Ready' : p.status}
                        {['fetching', 'transcribing', 'analyzing', 'clipping'].includes(p.status)
                          ? ` · ${p.progress}%`
                          : ''}
                      </span>
                      {fmtDuration(p.duration_seconds) && (
                        <span className="text-xs text-faint">{fmtDuration(p.duration_seconds)}</span>
                      )}
                      <span className="text-xs text-faint">{timeAgo(p.created_at)}</span>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="shrink-0 p-1 text-faint transition-colors hover:text-[color:var(--danger)]"
                  aria-label="Delete"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="card w-full max-w-sm p-6" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 font-semibold text-strong">Delete video?</h3>
            <p className="mb-5 text-sm text-muted">
              &ldquo;{deleteTarget.title || deleteTarget.source_url}&rdquo; and its clips will be permanently
              deleted. This can&apos;t be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-[var(--radius-sm)] bg-[color:var(--danger)] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Delete
              </button>
              <button ref={cancelBtnRef} onClick={() => setDeleteTarget(null)} className="btn-outline flex-1 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
