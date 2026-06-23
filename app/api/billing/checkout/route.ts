import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, billingConfigured, proPriceId, appUrl } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json(
      { error: 'Billing isn’t set up yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID.' },
      { status: 503 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const stripe = getStripe();
  const admin = createAdminClient();

  // Reuse the user's Stripe customer if we have one, else create + persist it.
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, plan')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.plan === 'pro') {
    return NextResponse.json({ error: 'You’re already on Pro.' }, { status: 400 });
  }

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: proPriceId(), quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/aeo?upgraded=1`,
    cancel_url: `${appUrl()}/aeo?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
