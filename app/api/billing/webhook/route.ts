import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/billing/stripe';

export const runtime = 'nodejs';
// Stripe needs the raw, unparsed body to verify the signature.
export const dynamic = 'force-dynamic';

const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);

async function applySubscription(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const isPro = PRO_STATUSES.has(sub.status);
  // current_period_end isn't always on the narrowed type; read it defensively.
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  const patch = {
    plan: isPro ? 'pro' : 'free',
    plan_status: sub.status,
    stripe_subscription_id: sub.id,
    plan_renews_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };

  // Match by customer id; fall back to the user_id we stamped in metadata.
  const userId = sub.metadata?.user_id;
  let query = admin.from('profiles').update(patch);
  query = userId ? query.eq('id', userId) : query.eq('stripe_customer_id', customerId);
  await query;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing not configured.' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[billing webhook] handler error', err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
