// Plan gate for Stage Finder (Core Premium). Free users see an upgrade screen
// instead of the tool. The Stage Finder API route enforces the same tier
// server-side for defense in depth.
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export default async function StageFinderLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank('core')) {
    return <UpgradeWall required="core" feature="Stage Finder" />;
  }
  return <>{children}</>;
}
