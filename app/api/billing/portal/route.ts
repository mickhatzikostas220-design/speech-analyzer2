import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, billingConfigured, appUrl } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

// Opens the Stripe billing portal so a Pro user can update payment details or
// cancel. Cancellation flows back to us via the webhook, which sets plan='free'.
export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json({ error: 'Billing isn’t set up yet.' }, { status: 503 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json({ error: 'No billing account yet.' }, { status: 400 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/aeo`,
  });

  return NextResponse.json({ url: session.url });
}
