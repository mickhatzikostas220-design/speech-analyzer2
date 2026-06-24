import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';

/**
 * Branded two-column auth shell: a signature/ink brand rail on the left
 * (hidden on small screens) and the form on the right. Pure presentational
 * so it stays usable from the client `login` / `signup` pages.
 */
export function AuthCard({
  railTone = 'signature',
  rail,
  children,
}: {
  railTone?: 'signature' | 'ink';
  rail: ReactNode;
  children: ReactNode;
}) {
  const railBg = railTone === 'ink' ? 'var(--surface-ink)' : 'var(--signature)';

  return (
    <div className="overflow-hidden rounded-xl bg-surface-card shadow-[0_12px_40px_rgba(20,30,55,.12)]">
      <div className="flex flex-col sm:flex-row">
        {/* brand rail */}
        <div
          className="flex flex-shrink-0 flex-col justify-between gap-10 p-7 sm:w-[190px]"
          style={{ background: railBg }}
        >
          <Logo brand={DEFAULT_BRAND} color="paper" size={19} />
          {rail}
        </div>

        {/* form */}
        <div className="flex-1 p-8 sm:p-10">{children}</div>
      </div>
    </div>
  );
}
