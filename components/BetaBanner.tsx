'use client';

// Slim app-wide notice for the free beta / newcomer grace period. Tells early
// speakers everything is free right now and points them at the feedback page.
// Dismissible, and the choice is remembered in localStorage so it doesn't nag on
// every page. Only rendered when FREE_BETA is on (see app/(app)/layout.tsx).
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const DISMISS_KEY = 'sh_beta_banner_dismissed';

export function BetaBanner() {
  // Start hidden so we never flash the banner at someone who already closed it;
  // the effect reveals it once we've checked localStorage on the client.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== '1') setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-[var(--border-subtle)] bg-surface-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <span className="rounded-[var(--radius-pill)] bg-[var(--signature)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--on-signature)]">
          Beta
        </span>
        <p className="min-w-0 flex-1 text-muted">
          Speaker Hub is free while we&rsquo;re still building it.{' '}
          <Link href="/feedback" className="font-semibold" style={{ color: 'var(--text-link)' }}>
            Tell us what you want to see &rarr;
          </Link>
        </p>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setShow(false);
          }}
          className="shrink-0 rounded p-1 text-faint transition-colors hover:text-strong"
          aria-label="Dismiss beta notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
