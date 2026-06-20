import Stripe from 'stripe';

// Lazy: Stripe throws if constructed without a key, and the module is imported at
// build time when no env is set. Routes call getStripe() only after
// billingConfigured(), so the key is present by then.
let client: Stripe | null = null;
export function getStripe(): Stripe {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export const billingConfigured = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
