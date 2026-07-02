import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { getUserBrandState } from '@/lib/brand/server';
import { BrandSettings } from '@/components/brand/BrandSettings';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const state = await getUserBrandState();
  if (!state.userId) redirect('/login');

  const plan = await getUserPlan(createClient());
  const canBrand = planRank(plan) >= planRank('core');

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="eyebrow mb-2">Settings</p>
      <h1 className="display-h1 mb-1">Your brand</h1>
      <p className="mb-8 text-muted">
        Make the hub feel like you. Changes apply across your whole hub.
      </p>

      <Link
        href="/settings/connections"
        className="card mb-4 flex items-center justify-between gap-4 p-4 transition hover:border-strong"
      >
        <div>
          <p className="font-bold text-strong">Connections &amp; API keys →</p>
          <p className="text-sm text-muted">
            Connect apps and add your API keys — shared by the Assistant and ClipFlow.
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>

      <Link
        href="/settings/one-sheet"
        className="card mb-4 flex items-center justify-between gap-4 p-4 transition hover:border-strong"
      >
        <div>
          <p className="font-bold text-strong">Public one-sheet →</p>
          <p className="text-sm text-muted">
            Your shareable speaker page (bio, talks, testimonials) with a “book me” form.
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>

      <Link
        href="/settings/plans"
        className="card mb-8 flex items-center justify-between gap-4 p-4 transition hover:border-strong"
      >
        <div>
          <p className="font-bold text-strong">Plans &amp; billing →</p>
          <p className="text-sm text-muted">
            See your current plan and what each tier unlocks.
          </p>
        </div>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-muted" />
      </Link>

      {canBrand ? (
        <BrandSettings initialBrand={state.brand} />
      ) : (
        <UpgradeWall required="core" feature="Brand Kit personalization" />
      )}
    </div>
  );
}
