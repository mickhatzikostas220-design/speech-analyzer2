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
  const kicked = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clipflow/${params.id}`);
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const data = await res.json();
    setProject(data);
    setLoading(false);
    return data as Project;
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
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-zinc-500 text-sm">Project not found.</p>
        <Link href="/clipflow" className="text-purple-400 text-sm hover:text-purple-300 mt-2 inline-block">
          ← Back to ClipFlow
        </Link>
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-8 w-48 bg-zinc-900 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl aspect-[9/16] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const processing = PROCESSING.includes(project.status);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div>
        <Link href="/clipflow" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          ← ClipFlow
        </Link>
        <h1 className="text-2xl font-semibold text-black mt-2">
          {project.title || 'Processing…'}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          {project.channel_title && (
            <span className="text-sm text-zinc-500">{project.channel_title}</span>
          )}
          <a
            href={project.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Source ↗
          </a>
        </div>

        {/* Preferences the clips were generated with */}
        {project.preferences &&
          (project.preferences.tone || project.preferences.length || project.preferences.notes) && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {project.preferences.length && (
                <span className="text-xs text-zinc-300 bg-zinc-800/80 border border-zinc-700 rounded-full px-2.5 py-1">
                  {CLIP_LENGTH_LABELS[project.preferences.length]}
                </span>
              )}
              {project.preferences.tone && (
                <span className="text-xs text-zinc-300 bg-zinc-800/80 border border-zinc-700 rounded-full px-2.5 py-1">
                  {project.preferences.tone}
                </span>
              )}
              {project.preferences.notes && (
                <span className="text-xs text-zinc-400 bg-zinc-800/50 border border-zinc-700 rounded-full px-2.5 py-1 max-w-full truncate">
                  “{project.preferences.notes}”
                </span>
              )}
            </div>
          )}
      </div>

      {/* Progress */}
      {processing && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-white font-medium">
              {STATUS_LABEL[project.status] ?? 'Working…'}
            </span>
            <span className="text-xs text-zinc-500">{project.progress}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-600 mt-3">
            This can take a moment for long videos — you can leave this page and come back.
          </p>
        </div>
      )}

      {/* Error */}
      {project.status === 'error' && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-5">
          <p className="text-sm text-red-300 font-medium mb-1">Processing failed</p>
          <p className="text-xs text-red-400/80">{project.error || 'Unknown error.'}</p>
          <button
            onClick={() => {
              kicked.current = false;
              fetch(`/api/clipflow/${params.id}/process`, { method: 'POST' }).then(() => load());
            }}
            className="mt-3 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Clips */}
      {project.clips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-black">
              {project.clips.length} clips
            </h2>
            {connected.length === 0 && (
              <Link href="/clipflow" className="text-xs text-purple-400 hover:text-purple-300">
                Connect a platform to post →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <p className="text-sm text-zinc-600 text-center py-10">No clips were generated for this video.</p>
      )}
    </div>
  );
}
