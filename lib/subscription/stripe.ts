// Stripe client + plan<->price mapping for subscription checkout.
//
// The defaults below are the SANDBOX (test-mode) price IDs created for Speaker
// Hub. In production set STRIPE_SECRET_KEY (live), STRIPE_PRICE_CORE,
// STRIPE_PRICE_FULL, and STRIPE_WEBHOOK_SECRET to the live-mode values.
import Stripe from 'stripe';
import type { PlanId } from './plans';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
  }
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

type PaidPlan = Exclude<PlanId, 'free'>;

export const PRICE_BY_PLAN: Record<PaidPlan, string> = {
  core: process.env.STRIPE_PRICE_CORE ?? 'price_1TnQnrC94feY1alwmBy6s45U',
  full: process.env.STRIPE_PRICE_FULL ?? 'price_1TnQo4C94feY1alwxPhF61tZ',
};

/** Reverse lookup: which plan does a Stripe price ID correspond to? */
export function planForPrice(priceId: string | null | undefined): PlanId {
  if (!priceId) return 'free';
  if (priceId === PRICE_BY_PLAN.core) return 'core';
  if (priceId === PRICE_BY_PLAN.full) return 'full';
  return 'free';
}
