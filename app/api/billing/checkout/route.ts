import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getStripe,
  isStripeConfigured,
  priceIdForPlan,
  ensureStripeCustomer,
} from '@/lib/billing/server';
import { PAID_PLANS } from '@/lib/billing/plans';

export const runtime = 'nodejs';

/**
 * Create a Stripe Checkout session for a paid plan and return its URL.
 * Body: { plan: 'core' | 'full' }
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== 'core' && plan !== 'full') {
    return NextResponse.json(
      { error: `plan must be one of: ${PAID_PLANS.join(', ')}` },
      { status: 400 }
    );
  }

  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID for the ${plan} plan is not configured.` },
      { status: 503 }
    );
  }

  // Find the user's existing Stripe customer id (if any).
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  try {
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: user.email,
      existingCustomerId: profile?.stripe_customer_id ?? null,
    });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/pricing?status=success`,
      cancel_url: `${appUrl}/pricing?status=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
      metadata: { user_id: user.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start checkout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
