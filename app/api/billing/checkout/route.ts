import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, billingConfigured, appUrl } from '@/lib/stripe';

export const runtime = 'nodejs';

// Start a Stripe Checkout session for a Pro subscription. Returns { url } to redirect to.
export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stripe = getStripe();
  const admin = createAdminClient();

  // Reuse this user's Stripe customer if we have one, else create and store it.
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await admin.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    client_reference_id: user.id,
    success_url: `${appUrl()}/settings/billing?upgraded=1`,
    cancel_url: `${appUrl()}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
