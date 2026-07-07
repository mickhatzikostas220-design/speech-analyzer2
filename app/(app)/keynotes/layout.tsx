// Plan gate for Keynote Tailoring (Core Premium). Free users see an upgrade
// screen instead of the tool. The tailoring API route enforces the same tier
// server-side for defense in depth.
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export default async function KeynotesLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank('core')) {
    return <UpgradeWall required="core" feature="Keynote Description Tailoring" />;
  }
  return <>{children}</>;
}
