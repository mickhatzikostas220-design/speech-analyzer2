'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ClipCard, type Clip } from '@/components/clipflow/ClipCard';
import { CLIP_LENGTH_LABELS, type ClipPreferences } from '@/lib/clipflow/types';

interface Project {
  id: string;
  source_url: string;
  source_type: string;
  youtube_id: string | null;
  title: string | null;
  channel_title: string | null;
  duration_seconds: number | null;
  preferences: ClipPreferences | null;
  status: string;
  progress: number;
  error: string | null;
  clips: Clip[];
}

const PROCESSING = ['queued', 'fetching', 'transcribing', 'analyzing', 'clipping'];

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  fetching: 'Fetching video metadata',
  transcribing: 'Fetching transcript',
  analyzing: 'Finding the best moments',
  clipping: 'Building your clips',
};

export default function ClipFlowProjectPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const kicked = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clipflow/${params.id}`);
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return null;
      }
      if (!res.ok) {
        // Don't set a malformed project (the render would crash on project.clips)
        // or leave the page stuck on the loading skeleton.
        setLoadError(true);
        setLoading(false);
        return null;
      }
      const data = await res.json();
      setProject(data);
      setLoadError(false);
      setLoading(false);
      return data as Project;
    } catch {
      // Network error — offer a retry instead of hanging on the spinner forever.
      setLoadError(true);
      setLoading(false);
      return null;
    }
  }, [params.id]);

  // Initial load + load connections.
  useEffect(() => {
    load();
    fetch('/api/clipflow/connections')
      .then((r) => r.json())
      .then((rows) =>
        setConnected(
          Array.isArray(rows) ? rows.filter((r) => r.connected).map((r) => r.platform) : []
        )
      )
      .catch(() => {});
  }, [load]);

  // Kick off processing + poll while the project is still working.
  useEffect(() => {
    if (!project) return;
    if (!PROCESSING.includes(project.status)) return;

    if (!kicked.current) {
      kicked.current = true;
      fetch(`/api/clipflow/${params.id}/process`, { method: 'POST' })
        .then(() => load())
        .catch(() => {});
    }

    const interval = setInterval(() => load(), 3000);
    return () => clearInterval(interval);
  }, [project, params.id, load]);

  function updateClip(clipId: string, patch: Partial<Clip>) {
    setProject((p) =>
      p ? { ...p, clips: p.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : p
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-muted">Project not found.</p>
        <Link href="/clipflow" className="mt-2 inline-block text-sm" style={{ color: 'var(--text-link)' }}>
          ← Back to ClipFlow
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-sm text-muted">We couldn&apos;t load this project. Check your connection and try again.</p>
        <button
          onClick={() => { setLoadError(false); setLoading(true); load(); }}
          className="mt-3 inline-block text-sm font-semibold"
          style={{ color: 'var(--text-link)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-[var(--surface-sunk)]" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[9/16] animate-pulse rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      </div>
    );
  }

  const processing = PROCESSING.includes(project.status);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <Link href="/clipflow" className="text-xs text-muted transition-colors hover:text-strong">
          ← ClipFlow
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-strong">
          {project.title || 'Processing…'}
        </h1>
        <div className="mt-1 flex items-center gap-3">
          {project.channel_title && (
            <span className="text-sm text-muted">{project.channel_title}</span>
          )}
          <a
            href={project.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs transition-colors hover:underline"
            style={{ color: 'var(--text-link)' }}
          >
            Source ↗
          </a>
        </div>

        {/* Preferences the clips were generated with */}
        {project.preferences &&
          (project.preferences.tone || project.preferences.length || project.preferences.notes) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {project.preferences.length && (
                <span className="rounded-full border border-[var(--border-default)] bg-[var(--surface-sunk)] px-2.5 py-1 text-xs text-body">
                  {CLIP_LENGTH_LABELS[project.preferences.length]}
                </span>
              )}
              {project.preferences.tone && (
                <span className="rounded-full border border-[var(--border-default)] bg-[var(--surface-sunk)] px-2.5 py-1 text-xs text-body">
                  {project.preferences.tone}
                </span>
              )}
              {project.preferences.notes && (
                <span className="max-w-full truncate rounded-full border border-[var(--border-default)] bg-[var(--surface-sunk)] px-2.5 py-1 text-xs text-muted">
                  “{project.preferences.notes}”
                </span>
              )}
            </div>
          )}
      </div>

      {/* Progress */}
      {processing && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-strong">
              {STATUS_LABEL[project.status] ?? 'Working…'}
            </span>
            <span className="text-xs text-muted">{project.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunk)]">
            <div
              className="h-full bg-[var(--signature)] transition-all duration-500"
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-faint">
            This can take a moment for long videos — you can leave this page and come back.
          </p>
        </div>
      )}

      {/* Error */}
      {project.status === 'error' && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--danger)] bg-[var(--danger-bg)] p-5">
          <p className="mb-1 text-sm font-medium" style={{ color: 'var(--danger)' }}>Processing failed</p>
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{project.error || 'Unknown error.'}</p>
          <button
            onClick={() => {
              kicked.current = false;
              fetch(`/api/clipflow/${params.id}/process`, { method: 'POST' }).then(() => load());
            }}
            className="btn-outline mt-3 text-xs"
            style={{ padding: '6px 12px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Clips */}
      {project.clips.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-strong">
              {project.clips.length} clips
            </h2>
            {connected.length === 0 && (
              <Link href="/clipflow" className="text-xs hover:underline" style={{ color: 'var(--text-link)' }}>
                Connect a platform to post →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                youtubeId={project.youtube_id}
                connectedPlatforms={connected}
                onChange={(patch) => updateClip(clip.id, patch)}
              />
            ))}
          </div>
        </div>
      )}

      {!processing && project.status === 'ready' && project.clips.length === 0 && (
        <p className="py-10 text-center text-sm text-faint">No clips were generated for this video.</p>
      )}
    </div>
  );
}
