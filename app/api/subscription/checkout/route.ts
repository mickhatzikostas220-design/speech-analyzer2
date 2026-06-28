// Create a Stripe Checkout Session for a subscription upgrade. The actual plan
// change is applied later by the webhook (never trusted from the client).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, stripeConfigured, PRICE_BY_PLAN } from '@/lib/subscription/stripe';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured yet. Please contact support.' },
      { status: 503 }
    );
  }

  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== 'core' && plan !== 'full') {
    return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });
  }
  const priceId = PRICE_BY_PLAN[plan];

  const stripe = getStripe();
  const admin = createAdminClient();

  // Reuse the saved Stripe customer if we have one, otherwise create it.
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  let customerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
    success_url: `${origin}/settings/plans?upgraded=1`,
    cancel_url: `${origin}/settings/plans`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
