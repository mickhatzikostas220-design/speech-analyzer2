'use client';

// A compact "Recent" dropdown for tools that keep a run history (SEO/AEO, Content
// Ideas, Stage Finder, Compare). Given the run summaries the page already loaded,
// it lets the user re-open a past result; clicking one fetches that run's full
// output and hands it back via onLoad so the page can rehydrate its own state.
//
// Hidden when there's nothing worth showing (0 or 1 runs). Presentational + a
// single fetch-by-id on click — the page owns loading the list.

import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { fetchRunById, type ToolRunSummary } from '@/lib/toolRuns/client';

export function ToolRunHistory({
  tool,
  items,
  onLoad,
  label = 'Recent',
}: {
  tool: string;
  items: ToolRunSummary[];
  onLoad: (output: unknown) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!items || items.length <= 1) return null;

  async function pick(id: string) {
    setBusy(id);
    const out = await fetchRunById(tool, id);
    setBusy(null);
    if (out) onLoad(out);
  }

  return (
    <details className="mb-6 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-surface-card">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-strong">
        <CalendarClock className="h-4 w-4 text-muted" />
        {label} ({items.length})
      </summary>
      <ul className="border-t border-[var(--border-subtle)] px-2 py-2">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => pick(it.id)}
              disabled={busy === it.id}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-sunk)] disabled:opacity-50"
            >
              <span className="truncate text-body">{it.title || 'Untitled'}</span>
              <span className="shrink-0 text-xs text-faint">
                {busy === it.id ? 'Loading…' : new Date(it.created_at).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
