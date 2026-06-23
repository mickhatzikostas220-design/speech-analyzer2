'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Lightbulb,
  Lock,
  Sparkles,
  CircleCheck,
  Loader2,
} from 'lucide-react';
import {
  CADENCE_LABELS,
  TRACK_LABELS,
  type AeoState,
  type Cadence,
  type Track,
  type UserTip,
} from '@/lib/aeo/types';

const TRACKS: Track[] = ['wix', 'other', 'code'];
const CADENCES: Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];

const EFFORT_LABEL: Record<string, string> = {
  quick: '~10 min',
  medium: '~30 min',
  project: 'A project',
};

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 1) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export function AeoCoach({ initial }: { initial: AeoState }) {
  const [state, setState] = useState<AeoState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isPro = state.plan === 'pro';
  const active = useMemo(() => state.tips.filter((t) => t.status === 'active'), [state.tips]);
  const completed = useMemo(() => state.tips.filter((t) => t.status === 'completed'), [state.tips]);
  const doneCount = completed.length;

  async function call(url: string, init?: RequestInit): Promise<boolean> {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBanner({ kind: 'err', text: data.error || 'Something went wrong.' });
      return false;
    }
    // Endpoints that return full state return the AeoState shape.
    if (data && typeof data.plan === 'string') setState(data as AeoState);
    return true;
  }

  async function getNewTip() {
    setBusy('release');
    setBanner(null);
    await call('/api/aeo/release', { method: 'POST' });
    setBusy(null);
  }

  // Surface the result of returning from Stripe Checkout / portal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded')) {
      setBanner({
        kind: 'ok',
        text: 'Payment received — your Pro plan is activating. Refresh in a moment if it hasn’t updated.',
      });
    } else if (params.get('canceled')) {
      setBanner({ kind: 'err', text: 'Checkout canceled — you’re still on the Free plan.' });
    }
    if (params.get('upgraded') || params.get('canceled')) {
      window.history.replaceState({}, '', '/aeo');
    }
  }, []);

  // Send the user to Stripe Checkout to subscribe to Pro.
  async function upgrade() {
    if (!state.billingConfigured) {
      setBanner({ kind: 'err', text: 'Billing isn’t set up yet — check back soon.' });
      return;
    }
    setBusy('plan');
    setBanner(null);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setBanner({ kind: 'err', text: data.error || 'Could not start checkout.' });
    } catch {
      setBanner({ kind: 'err', text: 'Could not reach checkout.' });
    }
    setBusy(null);
  }

  // Open the Stripe billing portal (update card or cancel — cancel downgrades via webhook).
  async function manageBilling() {
    setBusy('plan');
    setBanner(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setBanner({ kind: 'err', text: data.error || 'Could not open billing.' });
    } catch {
      setBanner({ kind: 'err', text: 'Could not reach billing.' });
    }
    setBusy(null);
  }

  async function setCadence(cadence: Cadence) {
    setBusy('cadence');
    setBanner(null);
    await call('/api/aeo/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence }),
    });
    setBusy(null);
  }

  // Optimistically toggle a tip's completion / track, then persist.
  async function patchTip(id: string, patch: Record<string, unknown>) {
    setState((s) => ({
      ...s,
      tips: s.tips.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(patch.completed !== undefined
                ? {
                    status: patch.completed ? 'completed' : 'active',
                    completed_at: patch.completed ? new Date().toISOString() : null,
                  }
                : {}),
              ...(patch.track !== undefined ? { track: patch.track as Track } : {}),
            }
          : t
      ),
    }));
    const res = await fetch(`/api/aeo/tips/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setBanner({ kind: 'err', text: 'Could not save — refresh and try again.' });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
      {/* hero */}
      <p className="eyebrow mb-2">AEO Coach</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-h1">Get found by AI</h1>
          <p className="mt-3 max-w-lg text-muted">
            Answer Engine Optimization — small, concrete moves that make ChatGPT, Perplexity, and
            Google AI Overviews understand who you are and recommend you. One tip at a time, with
            step-by-step instructions.
          </p>
        </div>
      </div>

      {/* plan + schedule bar */}
      <div className="mt-7 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
              style={
                isPro
                  ? { background: 'var(--signature)', color: 'var(--on-signature)' }
                  : { background: 'var(--surface-sunk)', color: 'var(--text-muted)' }
              }
            >
              {isPro ? <Sparkles className="h-3.5 w-3.5" /> : null}
              {isPro ? 'Pro' : 'Free'} plan
            </span>
            <span className="text-xs text-muted">
              {doneCount} of {state.totalCatalog} tips completed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">Deliver a new tip</label>
            <div className="relative">
              <select
                value={isPro ? state.cadence : 'weekly'}
                disabled={!isPro || busy === 'cadence'}
                onChange={(e) => setCadence(e.target.value as Cadence)}
                className="input appearance-none py-1.5 pl-3 pr-8 text-xs disabled:opacity-60"
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {CADENCE_LABELS[c]}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            </div>
          </div>
        </div>

        {/* progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunk)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${state.totalCatalog ? (doneCount / state.totalCatalog) * 100 : 0}%`,
              background: 'var(--success)',
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {state.exhausted ? (
            <p className="text-sm font-semibold text-strong">
              🎉 You’ve unlocked the entire playbook. Keep checking them off.
            </p>
          ) : state.canRelease ? (
            <button onClick={getNewTip} disabled={busy === 'release'} className="btn-primary">
              {busy === 'release' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lightbulb className="h-4 w-4" />
              )}
              Get a new tip
            </button>
          ) : (
            <button disabled className="btn-outline opacity-70">
              <Lock className="h-4 w-4" />
              {state.nextAvailableAt
                ? `Next tip in ${countdown(state.nextAvailableAt)}`
                : 'Next tip soon'}
            </button>
          )}

          {!isPro && (
            <button
              onClick={upgrade}
              disabled={busy === 'plan' || !state.billingConfigured}
              className="btn-ink"
            >
              {busy === 'plan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Upgrade to Pro — unlimited tips
            </button>
          )}
          {isPro && (
            <button
              onClick={manageBilling}
              disabled={busy === 'plan'}
              className="text-xs font-semibold text-faint transition-colors hover:text-muted"
            >
              Manage billing
            </button>
          )}
        </div>

        {!isPro && (
          <p className="mt-2 text-xs text-faint">
            Free plan delivers one tip a week. Pro unlocks unlimited tips on any schedule — daily,
            weekly, or whenever you want one.
            {!state.billingConfigured && ' (Upgrades open once billing is connected.)'}
          </p>
        )}
      </div>

      {banner && (
        <div
          className={`mt-4 rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'bg-[var(--success-bg)] text-[color:var(--success)]'
              : 'bg-[var(--danger-bg)] text-[color:var(--danger)]'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* active tips */}
      <h2 className="eyebrow mb-3 mt-9">Your tips</h2>
      {active.length === 0 && completed.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] p-6 text-center text-sm text-faint">
          Your first tip is on its way — hit “Get a new tip” above.
        </p>
      ) : (
        <div className="space-y-4">
          {active.map((tip) => (
            <TipCard key={tip.id} tip={tip} onPatch={patchTip} />
          ))}
        </div>
      )}

      {/* completed */}
      {completed.length > 0 && (
        <>
          <h2 className="eyebrow mb-3 mt-9">Completed</h2>
          <div className="space-y-3">
            {completed.map((tip) => (
              <TipCard key={tip.id} tip={tip} onPatch={patchTip} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TipCard({
  tip,
  onPatch,
}: {
  tip: UserTip;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
}) {
  const done = tip.status === 'completed';
  const [open, setOpen] = useState(!done);
  const [track, setTrack] = useState<Track>(tip.track ?? 'wix');
  const steps = tip.content.tracks[track];

  function chooseTrack(t: Track) {
    setTrack(t);
    if (tip.track !== t) onPatch(tip.id, { track: t });
  }

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-lg)] border bg-surface-card transition-colors"
      style={{ borderColor: done ? 'var(--success)' : 'var(--border-subtle)' }}
    >
      {/* header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={
            done
              ? { background: 'var(--success)', color: '#fff' }
              : { background: 'var(--signature)', color: 'var(--on-signature)' }
          }
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Lightbulb className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <h3
              className={`text-base font-extrabold ${done ? 'text-muted line-through' : 'text-strong'}`}
            >
              {tip.content.title}
            </h3>
          </span>
          <p className="mt-0.5 text-sm text-muted">{tip.content.summary}</p>
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            {EFFORT_LABEL[tip.content.effort] ?? tip.content.effort}
          </span>
        </span>
        <ChevronDown
          className={`mt-1 h-5 w-5 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--border-subtle)] px-4 pb-4 pt-4">
          {/* why */}
          <div className="mb-4 rounded-[var(--radius-sm)] bg-[var(--surface-sunk)] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-faint">Why it matters</p>
            <p className="mt-1 text-sm text-body">{tip.content.why}</p>
          </div>

          {/* track picker */}
          <p className="mb-2 text-xs font-semibold text-strong">How do you want to do it?</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {TRACKS.map((t) => {
              const sel = track === t;
              return (
                <button
                  key={t}
                  onClick={() => chooseTrack(t)}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={
                    sel
                      ? { background: 'var(--surface-ink)', color: 'var(--text-on-dark)', borderColor: 'var(--surface-ink)' }
                      : { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border-strong)' }
                  }
                >
                  {TRACK_LABELS[t]}
                </button>
              );
            })}
          </div>

          {/* steps */}
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-strong">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* complete toggle */}
          <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
            {done ? (
              <button
                onClick={() => onPatch(tip.id, { completed: false })}
                className="text-xs font-semibold text-faint transition-colors hover:text-muted"
              >
                Mark as not done
              </button>
            ) : (
              <span className="text-xs text-faint">Done it? Check it off.</span>
            )}
            <button
              onClick={() => onPatch(tip.id, { completed: !done })}
              className={done ? 'btn-outline' : 'btn-primary'}
              style={{ padding: '8px 16px', fontSize: 'var(--text-sm)' }}
            >
              <CircleCheck className="h-4 w-4" />
              {done ? 'Completed' : 'Mark complete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
