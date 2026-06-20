import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, billingConfigured, appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';

// Open the Stripe billing portal so a subscriber can manage or cancel. Returns { url }.
export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: sub } = await createAdminClient()
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription to manage.' }, { status: 400 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id as string,
    return_url: `${appUrl()}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
