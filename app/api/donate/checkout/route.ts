// Creates a Stripe Checkout Session for a donation to Speaker Hub.
//
// Donations are intentionally ANONYMOUS: we never attach the visitor's user id
// or their saved Stripe customer, and we tag the session (and any subscription)
// with kind:"donation". The subscription webhook — the ONLY place that changes a
// user's plan — checks for that tag and skips donation events. Between staying
// anonymous and the tag, a monthly donation can never affect anyone's plan tier.
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, stripeConfigured } from '@/lib/subscription/stripe';
import { DONATE_MIN, DONATE_MAX } from '@/lib/donate/config';

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Donations are not set up yet. Please check back soon.' },
      { status: 503 }
    );
  }

  let body: { amount?: unknown; frequency?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < DONATE_MIN || amount > DONATE_MAX) {
    return NextResponse.json(
      { error: `Please enter an amount between $${DONATE_MIN} and $${DONATE_MAX}.` },
      { status: 400 }
    );
  }

  const frequency = body.frequency;
  if (frequency !== 'once' && frequency !== 'monthly') {
    return NextResponse.json({ error: 'Invalid donation type.' }, { status: 400 });
  }
  const monthly = frequency === 'monthly';

  // Stripe works in the smallest currency unit (cents). Round to avoid float dust.
  const unitAmount = Math.round(amount * 100);

  const stripe = getStripe();
  const origin = new URL(request.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: monthly ? 'Monthly support for Speaker Hub' : 'Donation to Speaker Hub',
          },
          // Only recurring gifts get a monthly interval; one-time gifts omit it.
          ...(monthly ? { recurring: { interval: 'month' as const } } : {}),
        },
      },
    ],
    // Tag every donation so the plan webhook ignores it (defense in depth).
    metadata: { kind: 'donation' },
    ...(monthly ? { subscription_data: { metadata: { kind: 'donation' } } } : {}),
    // Show a "Donate" button on the one-time Checkout page (payment mode only).
    ...(monthly ? {} : { submit_type: 'donate' as const }),
    success_url: `${origin}/donate?thanks=1`,
    cancel_url: `${origin}/donate`,
  });

  return NextResponse.json({ url: session.url });
}
