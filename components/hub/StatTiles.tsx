import type { CSSProperties } from 'react';

export interface Stat {
  value: string;
  label: string;
  sub?: string;
  tone?: 'plain' | 'signature' | 'ink';
}

const TONES: Record<NonNullable<Stat['tone']>, CSSProperties> = {
  plain: { background: 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--border-subtle)' },
  signature: { background: 'var(--signature)', color: 'var(--on-signature)', border: '2px solid var(--border-strong)' },
  ink: { background: 'var(--surface-ink)', color: 'var(--paper)', border: '2px solid var(--surface-ink)' },
};

/** Big punchy brand stats — derived from real analysis data. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {stats.map((s) => {
        const tone = s.tone ?? 'plain';
        const t = TONES[tone];
        return (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-[var(--radius-md)] p-4 sm:p-5"
            style={t}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 'clamp(1.6rem, 1.1rem + 2vw, 2.6rem)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {s.value}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
              {s.label}
            </span>
            {s.sub && (
              <span
                style={{ fontSize: 'var(--text-xs)', opacity: tone === 'plain' ? 1 : 0.85 }}
                className={tone === 'plain' ? 'text-muted' : undefined}
              >
                {s.sub}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
