// Plan gate for Script Studio & the Talk Editor (Core Premium). Renders an
// upgrade screen for free users. Covers /editor and its sub-routes
// (/editor/script, /editor/timeline, /editor/[id]).
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank('core')) {
    return <UpgradeWall required="core" feature="Script Studio & the Talk Editor" />;
  }
  return <>{children}</>;
}
