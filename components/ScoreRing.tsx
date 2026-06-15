'use client';

interface Props {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 72 }: Props) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const color = score >= 70 ? 'var(--score-high)' : score >= 55 ? 'var(--score-mid)' : 'var(--score-low)';

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-200)" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className="-mt-1 text-xs leading-none text-muted" style={{ color }}>
        {score}/100
      </span>
    </div>
  );
}
