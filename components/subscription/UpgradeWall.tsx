// Shown in place of a premium tool when the signed-in user's plan is too low.
// Server-rendered by each gated route's layout.tsx (see app/(app)/<tool>/layout.tsx),
// so free users get a clean "upgrade to unlock" screen instead of the tool — the
// UI half of enforcing the plan tiers. (API routes should also verify plan for
// full defense-in-depth.)
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { PLAN_BY_ID, type PlanId } from '@/lib/subscription/plans';

export function UpgradeWall({ required, feature }: { required: PlanId; feature: string }) {
  const planName = PLAN_BY_ID[required].name;
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunk)]">
        <Lock className="h-6 w-6 text-muted" />
      </span>
      <p className="eyebrow mb-2">{planName}</p>
      <h1 className="display-h1 mb-3" style={{ fontSize: 'var(--text-h2)' }}>
        {feature} is a {planName} feature
      </h1>
      <p className="mb-7 max-w-md text-muted">
        Upgrade to {planName} to unlock {feature} — plus everything else in the {planName} toolkit.
      </p>
      <Link href="/settings/plans" className="btn-primary">
        See plans &amp; upgrade
      </Link>
    </div>
  );
}
