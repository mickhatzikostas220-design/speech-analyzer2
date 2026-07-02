// Small banner that shows a Free-plan speaker how many of their monthly Speech
// Analyzer runs are left, so the 3-per-month limit is transparent up front
// instead of a surprise wall when they hit "upload". Purely presentational —
// the caller computes `used` server-side (see app/(app)/analyze/page.tsx) and
// only renders this for free-plan users.

import Link from 'next/link';

export function FreeQuotaBanner({ used, limit }: { used: number; limit: number }) {
  const remaining = Math.max(0, limit - used);
  const atLimit = remaining === 0;

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-[var(--radius-md)] border px-4 py-3"
      style={{
        borderColor: atLimit ? 'var(--border-strong)' : 'var(--border-subtle)',
        background: atLimit ? 'var(--danger-bg)' : 'var(--surface-card)',
      }}
    >
      <p className="text-sm text-body">
        {atLimit ? (
          <>
            You&rsquo;ve used all{' '}
            <span className="font-semibold text-strong">{limit}</span> free analyses this month.
            Upgrade for unlimited.
          </>
        ) : (
          <>
            <span className="font-semibold text-strong">{remaining}</span> of {limit} free{' '}
            {remaining === 1 ? 'analysis' : 'analyses'} left this month.
          </>
        )}
      </p>
      <Link
        href="/settings/plans"
        className="whitespace-nowrap text-sm font-semibold"
        style={{ color: 'var(--text-link)' }}
      >
        {atLimit ? 'Upgrade now' : 'Upgrade'} &rarr;
      </Link>
    </div>
  );
}
