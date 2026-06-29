'use client';

// Paid-tier tips planner: schedule tips from the library and check them off.
import { useState } from 'react';
import { Check, Trash2, CalendarPlus } from 'lucide-react';
import { TIPS, tipById } from '@/lib/tips/library';

export interface UserTip {
  id: string;
  tip_id: string | null;
  source?: string;
  title?: string | null;
  body?: string | null;
  scheduled_for: string | null;
  completed: boolean;
}

// Resolve a row's display content: custom SEO tips carry their own title/body;
// coaching tips resolve from the static library.
function content(row: UserTip): { title: string; body: string | null } {
  if (row.source === 'seo') return { title: row.title ?? 'SEO fix', body: row.body ?? null };
  const tip = row.tip_id ? tipById(row.tip_id) : undefined;
  return { title: tip?.title ?? row.tip_id ?? 'Tip', body: tip?.body ?? null };
}

function fmtDate(iso: string | null) {
  if (!iso) return 'No date';
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TipsPlanner({ initialTips }: { initialTips: UserTip[] }) {
  const [tips, setTips] = useState<UserTip[]>(initialTips);
  const [dateByTip, setDateByTip] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function schedule(tipId: string) {
    setBusy(tipId);
    setError(null);
    try {
      const res = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip_id: tipId, scheduled_for: dateByTip[tipId] || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not schedule that tip.');
      } else {
        setTips((t) => [...t, data as UserTip]);
        setDateByTip((d) => ({ ...d, [tipId]: '' }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: UserTip) {
    setBusy(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/tips/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !row.completed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTips((t) => t.map((x) => (x.id === row.id ? (data as UserTip) : x)));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/tips/${id}`, { method: 'DELETE' });
      if (res.ok) setTips((t) => t.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const active = tips.filter((t) => !t.completed);
  const done = tips.filter((t) => t.completed);

  return (
    <div className="space-y-10">
      {error && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {/* Plan */}
      <section>
        <h2 className="section-title mb-3">Your tip plan</h2>
        {active.length === 0 ? (
          <p className="card p-5 text-sm text-muted">
            Nothing scheduled yet. Pick tips from the library below and give each one a date.
          </p>
        ) : (
          <div className="space-y-3">
            {active.map((row) => {
              const c = content(row);
              return (
                <div key={row.id} className="card flex items-start gap-3 p-4">
                  <button
                    onClick={() => toggle(row)}
                    disabled={busy === row.id}
                    aria-label="Mark complete"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 border-[var(--border-strong)] transition-colors hover:bg-[var(--surface-sunk)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-strong">{c.title}</p>
                    {c.body && <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{c.body}</p>}
                    <p className="mt-1 text-xs text-faint">{fmtDate(row.scheduled_for)}</p>
                  </div>
                  <button
                    onClick={() => remove(row.id)}
                    disabled={busy === row.id}
                    aria-label="Remove"
                    className="shrink-0 p-1 text-faint transition-colors hover:text-[color:var(--danger)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-5">
            <h3 className="eyebrow mb-2">Completed</h3>
            <div className="space-y-2">
              {done.map((row) => {
                const c = content(row);
                return (
                  <div key={row.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunk)] px-4 py-2.5">
                    <button
                      onClick={() => toggle(row)}
                      disabled={busy === row.id}
                      aria-label="Mark not complete"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[var(--success)] text-white"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                    <span className="flex-1 text-sm text-muted line-through">{c.title}</span>
                    <button onClick={() => remove(row.id)} disabled={busy === row.id} aria-label="Remove" className="p-1 text-faint hover:text-[color:var(--danger)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Library */}
      <section>
        <h2 className="section-title mb-3">Tip library</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {TIPS.map((tip) => (
            <div key={tip.id} className="card flex flex-col p-4">
              <p className="text-sm font-semibold text-strong">{tip.title}</p>
              <p className="mt-1 flex-1 text-xs text-muted">{tip.body}</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="date"
                  min={today}
                  value={dateByTip[tip.id] ?? ''}
                  onChange={(e) => setDateByTip((d) => ({ ...d, [tip.id]: e.target.value }))}
                  className="input flex-1 text-xs"
                  style={{ padding: '6px 10px' }}
                />
                <button
                  onClick={() => schedule(tip.id)}
                  disabled={busy === tip.id}
                  className="btn-primary text-xs"
                  style={{ padding: '7px 12px' }}
                >
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
