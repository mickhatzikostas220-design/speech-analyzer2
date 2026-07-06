// Stripe webhook — the ONLY place that changes a user's plan. Verifies the
// signature, then maps subscription lifecycle events to profiles.plan using the
// service-role admin client. Not auth-gated (excluded from middleware /api),
// trust comes from the signature.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe, planForPrice } from '@/lib/subscription/stripe';
import type { PlanId } from '@/lib/subscription/plans';

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  const raw = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const admin = createAdminClient();

  async function setPlan(userId: string, plan: PlanId, subscriptionId?: string | null) {
    const patch: Record<string, unknown> = { plan };
    if (subscriptionId !== undefined) patch.stripe_subscription_id = subscriptionId;
    await admin.from('profiles').update(patch).eq('id', userId);
  }

  // Resolve our user id from event metadata, falling back to the Stripe customer.
  async function resolveUserId(
    metaUserId: string | undefined,
    customerId: string | null
  ): Promise<string | null> {
    if (metaUserId) return metaUserId;
    if (!customerId) return null;
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();
    return (data as { id?: string } | null)?.id ?? null;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Donations are anonymous gifts, never plan changes — ignore them.
        if (session.metadata?.kind === 'donation') break;
        const userId = await resolveUserId(
          session.metadata?.user_id,
          typeof session.customer === 'string' ? session.customer : null
        );
        const plan = (session.metadata?.plan as PlanId) || 'free';
        if (userId) {
          await setPlan(
            userId,
            plan,
            typeof session.subscription === 'string' ? session.subscription : null
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        // A recurring donation is a subscription too — never touch a plan for it.
        if (sub.metadata?.kind === 'donation') break;
        const userId = await resolveUserId(
          sub.metadata?.user_id,
          typeof sub.customer === 'string' ? sub.customer : null
        );
        if (userId) {
          const priceId = sub.items.data[0]?.price?.id;
          const active = sub.status === 'active' || sub.status === 'trialing';
          await setPlan(userId, active ? planForPrice(priceId) : 'free', sub.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        // Cancelling a recurring donation must not downgrade anyone's plan.
        if (sub.metadata?.kind === 'donation') break;
        const userId = await resolveUserId(
          sub.metadata?.user_id,
          typeof sub.customer === 'string' ? sub.customer : null
        );
        if (userId) await setPlan(userId, 'free', null);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
