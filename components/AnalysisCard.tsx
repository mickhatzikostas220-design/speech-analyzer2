import Link from 'next/link';
import { ScoreRing } from './ScoreRing';
import type { Analysis } from '@/types';

function statusBadge(status: Analysis['status']) {
  const map: Record<Analysis['status'], { label: string; cls: string }> = {
    pending: { label: 'Queued', cls: 'text-muted bg-[var(--surface-sunk)]' },
    processing: { label: 'Analyzing…', cls: 'text-[color:var(--accent-2)] bg-[color:var(--accent-2)]/10 animate-pulse' },
    complete: { label: '', cls: '' },
    error: { label: 'Error', cls: 'text-[color:var(--danger)] bg-[var(--danger-bg)]' },
  };
  return map[status];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Talk length as m:ss. Returns null for missing/zero so the card can omit it.
function formatDuration(s: number | null) {
  if (!s || s <= 0) return null;
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const badge = statusBadge(analysis.status);
  const duration = formatDuration(analysis.duration_seconds);

  return (
    <Link
      href={`/analysis/${analysis.id}`}
      className="card group flex items-center gap-4 px-4 py-3 transition-all hover:border-strong hover:shadow-hard"
    >
      {analysis.status === 'complete' && analysis.overall_score !== null ? (
        <ScoreRing score={analysis.overall_score} size={48} />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunk)]">
          {analysis.status === 'processing' ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ink-200)] border-t-[var(--signature)]" />
          ) : analysis.status === 'error' ? (
            <svg className="h-5 w-5" style={{ color: 'var(--danger)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <div className="h-2 w-2 rounded-full bg-[var(--ink-400)]" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-strong">{analysis.title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted">{formatDate(analysis.created_at)}</span>
          {duration && (
            <span className="text-xs text-faint">{duration}</span>
          )}
          {analysis.file_type && (
            <span className="text-xs uppercase text-faint">{analysis.file_type}</span>
          )}
        </div>
      </div>

      {badge.label && (
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>
      )}
    </Link>
  );
}
