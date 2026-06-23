import { createClient } from '@/lib/supabase/server';
import { getAeoState } from '@/lib/aeo/server';
import { AeoCoach } from '@/components/aeo/AeoCoach';
import type { AeoState } from '@/lib/aeo/types';
import { AEO_CATALOG } from '@/lib/aeo/catalog';

export const dynamic = 'force-dynamic';

export default async function AeoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initial: AeoState = user
    ? await getAeoState(supabase, user.id)
    : {
        plan: 'free',
        cadence: 'weekly',
        tips: [],
        canRelease: true,
        nextAvailableAt: null,
        exhausted: false,
        totalCatalog: AEO_CATALOG.length,
        billingConfigured: false,
      };

  return <AeoCoach initial={initial} />;
}
