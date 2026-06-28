// Open the Stripe billing portal so a subscribed user can update payment
// details or cancel. Requires an existing Stripe customer on the profile.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, stripeConfigured } from '@/lib/subscription/stripe';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  const customerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: 'No billing account found.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings/plans`,
  });

  return NextResponse.json({ url: session.url });
}
