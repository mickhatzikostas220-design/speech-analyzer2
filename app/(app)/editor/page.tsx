'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EditorProject {
  id: string;
  title: string;
  status: 'empty' | 'processing' | 'ready' | 'error';
  videoDuration: number | null;
  clips: { id: string; selected: boolean }[];
  exportReady: boolean;
  createdAt: string;
}

function fmtDuration(s: number | null) {
  if (!s) return '—';
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

const STATUS_COLOR: Record<string, string> = {
  empty: 'text-zinc-500',
  processing: 'text-amber-400',
  ready: 'text-green-400',
  error: 'text-red-400',
};

export default function EditorPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/editor')
      .then((r) => r.json())
      .then((d) => { setProjects(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/editor/${data.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    await fetch(`/api/editor/${id}`, { method: 'DELETE' });
    setProjects((p) => p.filter((proj) => proj.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Video Editor</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Upload a video, detect speech segments, remove silences, and export.
          </p>
        </div>
        <button
          onClick={() => { setNewTitle(''); setShowModal(true); }}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-10 h-10 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-zinc-600">No projects yet — create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors"
            >
              <button className="flex-1 text-left" onClick={() => router.push(`/editor/${p.id}`)}>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium text-sm">{p.title}</span>
                  <span className={`text-xs capitalize ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                  {p.exportReady && (
                    <span className="text-xs text-purple-400">· export ready</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-zinc-600">{timeAgo(p.createdAt)}</span>
                  {p.videoDuration && (
                    <span className="text-xs text-zinc-600">{fmtDuration(p.videoDuration)}</span>
                  )}
                  {p.clips.length > 0 && (
                    <span className="text-xs text-zinc-600">
                      {p.clips.filter((c) => c.selected).length}/{p.clips.length} clips selected
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => deleteProject(p.id)}
                className="ml-4 p-1 text-zinc-700 hover:text-red-400 transition-colors"
                title="Delete project"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-semibold mb-4">New Project</h2>
            <form onSubmit={createProject} className="space-y-4">
              <input
                autoFocus
                type="text"
                placeholder="Project title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="text-sm text-zinc-400 hover:text-white px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
