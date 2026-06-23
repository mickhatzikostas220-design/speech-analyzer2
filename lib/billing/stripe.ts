import Stripe from 'stripe';

// Lazily instantiate so importing this module never throws when STRIPE_SECRET_KEY
// is absent (e.g. during `next build` page-data collection or when billing is off).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Billing is only usable once the secret key and the Pro price are both set.
export function billingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
}

export function proPriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error('STRIPE_PRICE_ID is not configured.');
  return id;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002').replace(/\/$/, '');
}
