'use client';

// Gives the tester demo account a brand-new-user experience on every visit.
//
// Mounted globally in the root layout, so it runs no matter where the tester
// lands (dashboard, onboarding, any tool). Once per browser session, if the
// signed-in user is the tester, it calls /api/tester/reset to wipe the account
// and then refreshes so the app re-renders in its fresh, un-onboarded state.
//
// The once-per-session guard (sessionStorage) is what makes this safe: it wipes
// when a new visit begins (a new tab, or reopening the app), but NOT while the
// tester navigates around during a session — so an in-progress demo is never
// destroyed mid-click. It renders nothing and does nothing for every other user.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isTesterEmail, TESTER_RESET_FLAG } from '@/lib/tester';

export function TesterFreshStart() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Already started fresh in this browser session — don't wipe again.
      if (sessionStorage.getItem(TESTER_RESET_FLAG)) return;

      // getSession reads the local cookie (no network) — cheap enough to run
      // for everyone; we bail immediately unless it's the tester account.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !isTesterEmail(session?.user?.email)) return;

      // Mark first, so a re-render (e.g. from router.refresh) can't wipe twice.
      sessionStorage.setItem(TESTER_RESET_FLAG, '1');

      const res = await fetch('/api/tester/reset', { method: 'POST' });
      if (!cancelled && res.ok) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
