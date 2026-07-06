'use client';

// Sitewide cookie-consent banner. Shows once, on first visit, until the visitor
// makes a choice. Speaker Hub only uses strictly-necessary cookies (Supabase
// auth/session) plus functional local storage (your consent choice, saved tips,
// UI preferences) — we don't run third-party advertising or cross-site tracking
// — so this banner is a transparency notice and a recorded choice, not a switch
// that has to disable trackers. The choice is stored in localStorage (so the
// banner doesn't reappear) and in a first-party cookie (so the server could read
// it later if we ever add non-essential cookies).
//
// Rendered from the root layout, so it appears on both the marketing site and
// the signed-in app. Styled with the shared brand design tokens and theme-aware.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'cookie-consent';

type Choice = 'accepted' | 'necessary';

function persist(choice: Choice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage blocked — the cookie below still records the choice */
  }
  try {
    // First-party, 1-year, lax cookie so a future server read is possible.
    document.cookie = `cookie_consent=${choice}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* non-fatal */
  }
}

export function CookieConsent() {
  // Start hidden; only reveal after we confirm no prior choice exists, so it
  // never flashes for returning visitors.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // If storage is unavailable we can't remember a dismissal, so don't nag.
    }
  }, []);

  if (!visible) return null;

  function choose(choice: Choice) {
    persist(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-[100] px-4 pb-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-surface-card p-4 shadow-lg sm:flex-row sm:items-center sm:gap-4">
        <div className="flex flex-1 items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-sm text-body">
            We use cookies to keep you signed in and to remember your preferences. We don&apos;t use
            advertising or cross-site tracking cookies. See our{' '}
            <Link href="/cookies" className="font-semibold text-strong underline underline-offset-2">
              Cookie Policy
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-semibold text-strong underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose('necessary')}
            className="btn-outline whitespace-nowrap text-sm"
          >
            Necessary only
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="btn-primary whitespace-nowrap text-sm"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
