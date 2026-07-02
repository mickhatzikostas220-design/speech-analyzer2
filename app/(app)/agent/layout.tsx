// Plan gate for the AI Assistant (Full Premium). Renders an upgrade screen
// instead of the tool when the signed-in user's plan is below Full.
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank('full')) {
    return <UpgradeWall required="full" feature="the AI Assistant" />;
  }
  return <>{children}</>;
}
