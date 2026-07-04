'use client';

// Settings → Memory: the transparency + control surface for what the app
// remembers about the user. Lists every remembered fact, lets them add, edit,
// or delete any of it, and turn memory off entirely. Talks to /api/memory.
import { useCallback, useEffect, useState } from 'react';

type MemorySource = 'auto' | 'explicit';

interface MemoryRow {
  id: string;
  content: string;
  category: string;
  source: MemorySource;
  created_at: string;
}

export function MemorySettings() {
  const [memories, setMemories] = useState<MemoryRow[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/memory');
    if (!res.ok) return;
    const d = await res.json();
    setMemories(d.memories ?? []);
    setEnabled(Boolean(d.enabled));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(kind: 'ok' | 'err', text: string) {
    setBanner({ kind, text });
    window.setTimeout(() => setBanner(null), 3000);
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    const res = await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      setEnabled(!next);
      flash('err', 'Could not change that.');
    } else {
      flash('ok', next ? 'Memory is on.' : 'Memory is off. Existing items are kept but not used.');
    }
  }

  async function add() {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const j = await res.json().catch(() => ({}));
    setAdding(false);
    if (res.ok) {
      setDraft('');
      flash('ok', 'Got it — I’ll remember that.');
      load();
    } else {
      flash('err', j.error || 'Could not save that.');
    }
  }

  async function saveEdit(id: string) {
    const content = editText.trim();
    if (!content) return;
    const res = await fetch(`/api/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setEditingId(null);
      setEditText('');
      load();
    } else {
      flash('err', 'Could not update that.');
    }
  }

  async function remove(id: string) {
    // Optimistic removal — it's easily re-added and delete rarely fails.
    setMemories((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
  }

  if (!memories) {
    return (
      <div className="h-40 animate-pulse rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)]" />
    );
  }

  return (
    <div className="card space-y-5 p-4">
      {/* Master switch */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-strong">Memory</h2>
          <p className="mt-0.5 text-xs text-muted">
            When it&apos;s on, the app remembers durable facts you share — your goals, upcoming talks,
            and how you like to work — and uses them to personalize the assistant and tools.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${
            enabled ? 'bg-[color:var(--signature)]' : 'bg-[var(--border-default)]'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
              enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* Add a memory */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-strong">Add something to remember</h3>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
            disabled={!enabled}
            placeholder="e.g. I have a keynote at SXSW in March"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-xs text-strong placeholder:text-[var(--text-faint)] focus:border-[color:var(--signature)] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={add}
            disabled={adding || !draft.trim() || !enabled}
            className="btn-primary whitespace-nowrap text-xs"
            style={{ padding: '8px 16px' }}
          >
            {adding ? 'Saving…' : 'Remember'}
          </button>
        </div>
      </div>

      {/* The list */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-strong">
          What the app remembers{memories.length ? ` (${memories.length})` : ''}
        </h3>
        {memories.length === 0 && (
          <p className="text-xs text-faint">
            Nothing yet. As you chat with the assistant and use the tools, durable facts will show up
            here — or add one above.
          </p>
        )}
        {memories.map((m) => (
          <div
            key={m.id}
            className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-3"
          >
            {editingId === m.id ? (
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(m.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-surface-card px-2 py-1 text-xs text-strong focus:border-[color:var(--signature)] focus:outline-none"
              />
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-xs text-body">{m.content}</p>
                <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-faint">
                  {m.source === 'auto' ? 'Learned automatically' : 'You told me'}
                  {m.category && m.category !== 'other' ? ` · ${m.category}` : ''}
                </span>
              </div>
            )}

            <div className="flex shrink-0 gap-2">
              {editingId === m.id ? (
                <>
                  <button
                    onClick={() => saveEdit(m.id)}
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--text-link)' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-[11px] text-muted hover:text-strong"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(m.id);
                      setEditText(m.content);
                    }}
                    className="text-[11px] text-muted hover:text-strong"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(m.id)}
                    className="text-[11px] text-muted hover:text-[color:var(--danger)]"
                  >
                    Forget
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {banner && (
        <p
          className={`rounded-[var(--radius-sm)] px-3 py-2 text-[11px] ${
            banner.kind === 'ok'
              ? 'border border-[color:var(--success)]/40 bg-[var(--success-bg)] text-[color:var(--success)]'
              : 'border border-[color:var(--danger)]/40 bg-[var(--danger-bg)] text-[color:var(--danger)]'
          }`}
        >
          {banner.text}
        </p>
      )}
    </div>
  );
}
