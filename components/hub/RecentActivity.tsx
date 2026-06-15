import Link from 'next/link';
import { Loader2, AlertCircle, Clock } from 'lucide-react';
import type { Analysis } from '@/types';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Ring({ score, size = 44 }: { score: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color = score >= 70 ? 'var(--score-high)' : score >= 55 ? 'var(--score-mid)' : 'var(--score-low)';
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-200)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>
        {score}
      </span>
    </span>
  );
}

function StatusBubble({ status }: { status: Analysis['status'] }) {
  const map = {
    processing: { Icon: Loader2, cls: 'text-[color:var(--accent-2)]', spin: true, bg: 'bg-[color:var(--accent-2)]/10' },
    error: { Icon: AlertCircle, cls: 'text-[color:var(--danger)]', spin: false, bg: 'bg-[var(--danger-bg)]' },
    pending: { Icon: Clock, cls: 'text-muted', spin: false, bg: 'bg-[var(--surface-sunk)]' },
    complete: { Icon: Clock, cls: 'text-muted', spin: false, bg: 'bg-[var(--surface-sunk)]' },
  }[status];
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${map.bg}`}>
      <map.Icon className={`h-5 w-5 ${map.cls} ${map.spin ? 'animate-spin' : ''}`} />
    </span>
  );
}

export function RecentActivity({ analyses }: { analyses: Analysis[] }) {
  const items = analyses.slice(0, 4);

  if (!items.length) {
    return (
      <div className="card p-6 text-sm text-muted">
        No activity yet —{' '}
        <Link href="/analyze" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          upload your first talk
        </Link>{' '}
        to get started.
      </div>
    );
  }

  return (
    <div className="card p-2 sm:p-3">
      {items.map((a) => {
        const done = a.status === 'complete' && a.overall_score !== null;
        const verb =
          a.status === 'complete'
            ? `scored ${a.overall_score}`
            : a.status === 'processing'
            ? 'is analyzing…'
            : a.status === 'error'
            ? 'hit a snag'
            : 'is queued';
        return (
          <Link
            key={a.id}
            href={`/analysis/${a.id}`}
            className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
          >
            {done ? <Ring score={a.overall_score as number} /> : <StatusBubble status={a.status} />}
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-strong">{a.title}</span>{' '}
              <span className="text-muted">{verb}</span>
            </div>
            <span className="shrink-0 text-xs text-faint">{timeAgo(a.created_at)}</span>
          </Link>
        );
      })}
    </div>
  );
}
