'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EditorProject {
  id: string;
  title: string;
  status: 'empty' | 'ready' | 'error';
  video_duration: number | null;
  clips: { id: string; selected: boolean }[];
  created_at: string;
}

interface ScriptProject {
  id: string;
  title: string;
  status: string;
  clips: unknown[];
  created_at: string;
}

interface TimelineProject {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

async function safeJson(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const text = (await res.text()).trim();
    const data = text ? JSON.parse(text) : {};
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: `Server error ${res.status}` } };
  }
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
  ready: 'text-green-400',
  error: 'text-red-400',
};

export default function EditorPage() {
  const router = useRouter();

  // ── Silence-removal projects ───────────────────────────────
  const [projects, setProjects] = useState<EditorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Script projects ────────────────────────────────────────
  const [scriptProjects, setScriptProjects] = useState<ScriptProject[]>([]);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [newScriptTitle, setNewScriptTitle] = useState('');
  const [creatingScript, setCreatingScript] = useState(false);
  const [scriptCreateError, setScriptCreateError] = useState<string | null>(null);

  // ── Timeline projects ──────────────────────────────────────
  const [timelineProjects, setTimelineProjects] = useState<TimelineProject[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);

  useEffect(() => {
    fetch('/api/editor')
      .then(safeJson)
      .then(({ data }) => {
        setProjects(Array.isArray(data) ? (data as unknown as EditorProject[]) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch('/api/editor/script')
      .then(safeJson)
      .then(({ data }) => {
        setScriptProjects(Array.isArray(data) ? (data as unknown as ScriptProject[]) : []);
        setScriptLoading(false);
      })
      .catch(() => setScriptLoading(false));

    fetch('/api/editor/timeline')
      .then(safeJson)
      .then(({ data }) => {
        setTimelineProjects(Array.isArray(data) ? (data as unknown as TimelineProject[]) : []);
        setTimelineLoading(false);
      })
      .catch(() => setTimelineLoading(false));
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const { ok, data } = await safeJson(res);
      if (ok) {
        router.push(`/editor/${(data as { id: string }).id}`);
      } else {
        setCreateError((data.error as string) || `Server error ${res.status}`);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    const res = await fetch(`/api/editor/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setProjects((p) => p.filter((proj) => proj.id !== id));
  }

  async function createScriptProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newScriptTitle.trim()) return;
    setCreatingScript(true);
    setScriptCreateError(null);
    try {
      const res = await fetch('/api/editor/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newScriptTitle.trim() }),
      });
      const { ok, data } = await safeJson(res);
      if (ok) {
        router.push(`/editor/script/${(data as { id: string }).id}`);
      } else {
        setScriptCreateError((data.error as string) || `Server error ${res.status}`);
      }
    } catch (err) {
      setScriptCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreatingScript(false);
    }
  }

  async function deleteScriptProject(id: string) {
    const res = await fetch(`/api/editor/script/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setScriptProjects((p) => p.filter((proj) => proj.id !== id));
  }

  async function deleteTimelineProject(id: string) {
    const res = await fetch(`/api/editor/timeline/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setTimelineProjects((p) => p.filter((proj) => proj.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">
      {/* ── Silence Removal Section ─────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Video Editor</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Upload a video, detect speech segments, remove silences, and export.
            </p>
          </div>
          <button
            onClick={() => { setNewTitle(''); setCreateError(null); setShowModal(true); }}
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
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-zinc-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-zinc-600">{timeAgo(p.created_at)}</span>
                    {p.video_duration && (
                      <span className="text-xs text-zinc-600">{fmtDuration(p.video_duration)}</span>
                    )}
                    {p.clips?.length > 0 && (
                      <span className="text-xs text-zinc-600">
                        {p.clips.filter((c) => c.selected).length}/{p.clips.length} clips
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  className="ml-4 p-1 text-zinc-700 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Script Editor Section ───────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Script Editor</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Upload clips, paste a script, and auto-assemble in script order.
            </p>
          </div>
          <button
            onClick={() => { setNewScriptTitle(''); setScriptCreateError(null); setShowScriptModal(true); }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Script Project
          </button>
        </div>

        {scriptLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : scriptProjects.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-10 h-10 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-zinc-600">No script projects yet — create one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scriptProjects.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors"
              >
                <button className="flex-1 text-left" onClick={() => router.push(`/editor/script/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm">{p.title}</span>
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-zinc-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-zinc-600">{timeAgo(p.created_at)}</span>
                    {p.clips?.length > 0 && (
                      <span className="text-xs text-zinc-600">
                        {p.clips.length} {p.clips.length === 1 ? 'clip' : 'clips'}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => deleteScriptProject(p.id)}
                  className="ml-4 p-1 text-zinc-700 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Timeline Editor Section ────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">Timeline Editor</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Projects brought here from the Script Editor — add captions, trim, reorder, and export.
          </p>
        </div>

        {timelineLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : timelineProjects.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <svg className="w-8 h-8 mx-auto mb-2 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm text-zinc-600">No timeline projects yet — use "Bring to Editor" in a Script project.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timelineProjects.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between hover:border-zinc-700 transition-colors"
              >
                <button className="flex-1 text-left" onClick={() => router.push(`/editor/timeline/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-medium text-sm">{p.title}</span>
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-zinc-500'}`}>
                      {p.status}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600">{timeAgo(p.created_at)}</span>
                </button>
                <button
                  onClick={() => deleteTimelineProject(p.id)}
                  className="ml-4 p-1 text-zinc-700 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── New Silence Project Modal ───────────────────────── */}
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
              {createError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {createError}
                </p>
              )}
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
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Script Project Modal ────────────────────────── */}
      {showScriptModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowScriptModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-semibold mb-4">New Script Project</h2>
            <form onSubmit={createScriptProject} className="space-y-4">
              {scriptCreateError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {scriptCreateError}
                </p>
              )}
              <input
                autoFocus
                type="text"
                placeholder="Project title"
                value={newScriptTitle}
                onChange={(e) => setNewScriptTitle(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowScriptModal(false)}
                  className="text-sm text-zinc-400 hover:text-white px-3 py-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingScript || !newScriptTitle.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {creatingScript ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
