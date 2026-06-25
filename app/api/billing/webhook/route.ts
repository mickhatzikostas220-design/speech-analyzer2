import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import {
  getStripe,
  applyPlanChange,
  setPaymentFailed,
  planForPriceId,
} from '@/lib/billing/server';

// Stripe signature verification needs the raw, unparsed request body, so this
// must run on the Node.js runtime (not Edge) and read request.text() directly.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function priceIdFromSubscription(sub: Stripe.Subscription): string | undefined {
  return sub.items.data[0]?.price?.id;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 });
  }

  try {
    const stripe = getStripe();

    switch (event.type) {
      // A checkout completed → upgrade the user to the purchased plan.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!customerId) break;

        let plan = planForPriceId(undefined);
        let subscriptionId: string | null = null;
        if (session.subscription) {
          subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          plan = planForPriceId(priceIdFromSubscription(sub));
        }

        await applyPlanChange({ customerId, plan, subscriptionId, paymentFailed: false });
        break;
      }

      // Subscription changed (plan switch, renewal, status change) → re-sync plan.
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const active = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
        const plan = active ? planForPriceId(priceIdFromSubscription(sub)) : 'free';
        await applyPlanChange({ customerId, plan, subscriptionId: sub.id });
        break;
      }

      // Subscription canceled/ended → downgrade back to Free.
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        await applyPlanChange({ customerId, plan: 'free', subscriptionId: null });
        break;
      }

      // Payment failed → flag the account.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) await setPaymentFailed(customerId, true);
        break;
      }

      // Payment recovered → clear the flag.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) await setPaymentFailed(customerId, false);
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook handler error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
