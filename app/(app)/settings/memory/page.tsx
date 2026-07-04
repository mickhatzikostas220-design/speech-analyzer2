// Settings → Memory page. Lets the user see, edit, delete, and toggle everything
// the app remembers about them. Free for all tiers, so no plan gate here.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MemorySettings } from '@/components/settings/MemorySettings';

export const dynamic = 'force-dynamic';

export default async function MemorySettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-strong">Memory</h1>
          <p className="mt-1 text-sm text-muted">
            The more the app knows about you, the more personal it gets. You&apos;re in control of
            everything it remembers.
          </p>
        </div>
        <Link
          href="/settings"
          className="text-sm font-semibold hover:underline"
          style={{ color: 'var(--text-link)' }}
        >
          ← Settings
        </Link>
      </div>

      <MemorySettings />
    </div>
  );
}
