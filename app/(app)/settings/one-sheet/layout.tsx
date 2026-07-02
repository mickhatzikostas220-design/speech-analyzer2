// Plan gate for the public one-sheet editor (Core Premium). Free users get an
// upgrade screen instead of the editor.
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { planRank } from '@/lib/subscription/plans';
import { UpgradeWall } from '@/components/subscription/UpgradeWall';

export default async function OneSheetLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const plan = await getUserPlan(supabase);
  if (planRank(plan) < planRank('core')) {
    return <UpgradeWall required="core" feature="the public one-sheet" />;
  }
  return <>{children}</>;
}
