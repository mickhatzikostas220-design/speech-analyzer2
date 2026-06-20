import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

// Stripe → us. Keeps subscriptions.status in sync so the daily limit knows who's
// Pro. The raw body + signature check is the trust boundary: never skip it.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Match the row created at checkout by its Stripe customer id, and copy the
  // current status across. The atomic limit function reads this status.
  const sync = async (sub: Stripe.Subscription) => {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await admin
      .from('subscriptions')
      .update({
        status: sub.status,
        stripe_subscription_id: sub.id,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_customer_id', customerId);
  };

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await sync(event.data.object as Stripe.Subscription);
      break;
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        await sync(await stripe.subscriptions.retrieve(s.subscription as string));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
