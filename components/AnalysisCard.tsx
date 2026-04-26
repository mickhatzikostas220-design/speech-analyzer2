import Link from 'next/link';
import { ScoreRing } from './ScoreRing';
import type { Analysis } from '@/types';

function statusBadge(status: Analysis['status']) {
  const map: Record<Analysis['status'], { label: string; cls: string }> = {
    pending: { label: 'Queued', cls: 'text-zinc-500 bg-zinc-800' },
    processing: { label: 'Analyzing…', cls: 'text-purple-400 bg-purple-500/10 animate-pulse' },
    complete: { label: '', cls: '' },
    error: { label: 'Error', cls: 'text-red-400 bg-red-500/10' },
  };
  return map[status];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const badge = statusBadge(analysis.status);

  return (
    <Link
      href={`/analysis/${analysis.id}`}
      className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors group"
    >
      {analysis.status === 'complete' && analysis.overall_score !== null ? (
        <ScoreRing score={analysis.overall_score} size={48} />
      ) : (
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
          {analysis.status === 'processing' ? (
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          ) : analysis.status === 'error' ? (
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <div className="w-2 h-2 rounded-full bg-zinc-600" />
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate group-hover:text-purple-300 transition-colors">
          {analysis.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-zinc-600 text-xs">{formatDate(analysis.created_at)}</span>
          {analysis.file_type && (
            <span className="text-zinc-700 text-xs uppercase">{analysis.file_type}</span>
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
