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
  empty: 'text-muted',
  ready: 'text-[color:var(--success)]',
  error: 'text-[color:var(--danger)]',
};

const PlusIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

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
    await fetch(`/api/editor/${id}`, { method: 'DELETE' });
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
    await fetch(`/api/editor/script/${id}`, { method: 'DELETE' });
    setScriptProjects((p) => p.filter((proj) => proj.id !== id));
  }

  async function deleteTimelineProject(id: string) {
    await fetch(`/api/editor/timeline/${id}`, { method: 'DELETE' });
    setTimelineProjects((p) => p.filter((proj) => proj.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-10">
      {/* ── Silence Removal Section ─────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow mb-1">Talk Editor</p>
            <h1 className="display-h1" style={{ fontSize: 'var(--text-h3)' }}>Video editor</h1>
            <p className="mt-1 text-sm text-muted">
              Upload a video, detect speech segments, remove silences, and export.
            </p>
          </div>
          <button
            onClick={() => { setNewTitle(''); setCreateError(null); setShowModal(true); }}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: 'var(--text-sm)' }}
          >
            <PlusIcon /> New project
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-[var(--ink-300)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-faint">No projects yet — create one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-4 transition-colors hover:border-strong">
                <button className="flex-1 text-left" onClick={() => router.push(`/editor/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-strong">{p.title}</span>
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-muted'}`}>{p.status}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4">
                    <span className="text-xs text-faint">{timeAgo(p.created_at)}</span>
                    {p.video_duration && <span className="text-xs text-faint">{fmtDuration(p.video_duration)}</span>}
                    {p.clips?.length > 0 && (
                      <span className="text-xs text-faint">
                        {p.clips.filter((c) => c.selected).length}/{p.clips.length} clips
                      </span>
                    )}
                  </div>
                </button>
                <button onClick={() => deleteProject(p.id)} className="ml-4 p-1 text-faint transition-colors hover:text-[color:var(--danger)]">
                  <TrashIcon />
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
            <h2 className="display-h1" style={{ fontSize: 'var(--text-h3)' }}>Script Studio</h2>
            <p className="mt-1 text-sm text-muted">
              Upload clips, paste a script, and auto-assemble in script order.
            </p>
          </div>
          <button
            onClick={() => { setNewScriptTitle(''); setScriptCreateError(null); setShowScriptModal(true); }}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: 'var(--text-sm)' }}
          >
            <PlusIcon /> New script
          </button>
        </div>

        {scriptLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
            ))}
          </div>
        ) : scriptProjects.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-[var(--ink-300)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-faint">No script projects yet — create one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {scriptProjects.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-4 transition-colors hover:border-strong">
                <button className="flex-1 text-left" onClick={() => router.push(`/editor/script/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-strong">{p.title}</span>
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-muted'}`}>{p.status}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4">
                    <span className="text-xs text-faint">{timeAgo(p.created_at)}</span>
                    {p.clips?.length > 0 && (
                      <span className="text-xs text-faint">
                        {p.clips.length} {p.clips.length === 1 ? 'clip' : 'clips'}
                      </span>
                    )}
                  </div>
                </button>
                <button onClick={() => deleteScriptProject(p.id)} className="ml-4 p-1 text-faint transition-colors hover:text-[color:var(--danger)]">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Timeline Editor Section ────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="display-h1" style={{ fontSize: 'var(--text-h3)' }}>Timeline editor</h2>
          <p className="mt-1 text-sm text-muted">
            Projects brought here from Script Studio — add captions, trim, reorder, and export.
          </p>
        </div>

        {timelineLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
            ))}
          </div>
        ) : timelineProjects.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] py-12 text-center">
            <svg className="mx-auto mb-2 h-8 w-8 text-[var(--ink-300)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <p className="text-sm text-faint">No timeline projects yet — use “Bring to Editor” in a Script project.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timelineProjects.map((p) => (
              <div key={p.id} className="card flex items-center justify-between p-4 transition-colors hover:border-strong">
                <button className="flex-1 text-left" onClick={() => router.push(`/editor/timeline/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-strong">{p.title}</span>
                    <span className={`text-xs capitalize ${STATUS_COLOR[p.status] ?? 'text-muted'}`}>{p.status}</span>
                  </div>
                  <span className="text-xs text-faint">{timeAgo(p.created_at)}</span>
                </button>
                <button onClick={() => deleteTimelineProject(p.id)} className="ml-4 p-1 text-faint transition-colors hover:text-[color:var(--danger)]">
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── New Silence Project Modal ───────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink-900)]/50 p-4" onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-sm p-6" style={{ borderWidth: 2, borderColor: 'var(--border-strong)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="section-title mb-4" style={{ fontSize: 'var(--text-h4)' }}>New project</h2>
            <form onSubmit={createProject} className="space-y-4">
              {createError && (
                <p className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {createError}
                </p>
              )}
              <input
                autoFocus
                type="text"
                placeholder="Project title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="input w-full text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 'var(--text-sm)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating || !newTitle.trim()} className="btn-primary" style={{ padding: '8px 16px', fontSize: 'var(--text-sm)' }}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New Script Project Modal ────────────────────────── */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink-900)]/50 p-4" onClick={() => setShowScriptModal(false)}>
          <div className="card w-full max-w-sm p-6" style={{ borderWidth: 2, borderColor: 'var(--border-strong)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="section-title mb-4" style={{ fontSize: 'var(--text-h4)' }}>New script project</h2>
            <form onSubmit={createScriptProject} className="space-y-4">
              {scriptCreateError && (
                <p className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {scriptCreateError}
                </p>
              )}
              <input
                autoFocus
                type="text"
                placeholder="Project title"
                value={newScriptTitle}
                onChange={(e) => setNewScriptTitle(e.target.value)}
                className="input w-full text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowScriptModal(false)} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 'var(--text-sm)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creatingScript || !newScriptTitle.trim()} className="btn-primary" style={{ padding: '8px 16px', fontSize: 'var(--text-sm)' }}>
                  {creatingScript ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
