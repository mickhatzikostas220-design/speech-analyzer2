import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan, type Plan, type PlanId } from './plans';

// ── Stripe client ────────────────────────────────────────────────────────────
let _stripe: Stripe | null = null;

/** Lazily-constructed Stripe client. Throws a clear error if the key is unset. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ── Price ID ⇄ plan mapping ──────────────────────────────────────────────────
export function priceIdForPlan(plan: PlanId): string | undefined {
  if (plan === 'core') return process.env.STRIPE_CORE_PRICE_ID;
  if (plan === 'full') return process.env.STRIPE_FULL_PRICE_ID;
  return undefined;
}

/** Map a Stripe price ID back to one of our plan ids (defaults to free). */
export function planForPriceId(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_FULL_PRICE_ID) return 'full';
  if (priceId && priceId === process.env.STRIPE_CORE_PRICE_ID) return 'core';
  return 'free';
}

// ── Billing state ────────────────────────────────────────────────────────────
export interface Billing {
  plan: PlanId;
  planConfig: Plan;
  analysisCount: number;
  analysisResetDate: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  prioritySupport: boolean;
  paymentFailed: boolean;
  /** Analyses remaining this period; null = unlimited. */
  remaining: number | null;
}

interface ProfileBillingRow {
  plan: string | null;
  analysis_count: number | null;
  analysis_reset_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  priority_support: boolean | null;
  payment_failed: boolean | null;
}

const BILLING_COLUMNS =
  'plan, analysis_count, analysis_reset_date, stripe_customer_id, stripe_subscription_id, priority_support, payment_failed';

/** First instant of next calendar month (UTC) — when a free user's quota resets. */
function startOfNextMonth(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

function toBilling(row: ProfileBillingRow): Billing {
  const plan = (row.plan ?? 'free') as PlanId;
  const planConfig = getPlan(plan);
  const analysisCount = row.analysis_count ?? 0;
  const limit = planConfig.monthlyAnalysisLimit;
  return {
    plan,
    planConfig,
    analysisCount,
    analysisResetDate: row.analysis_reset_date,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    prioritySupport: row.priority_support ?? false,
    paymentFailed: row.payment_failed ?? false,
    remaining: limit === null ? null : Math.max(0, limit - analysisCount),
  };
}

/**
 * Read a user's billing state, resetting their monthly usage window first if the
 * reset date has passed (or was never set). The window reset is written with the
 * admin client so it works regardless of who is calling.
 *
 * Returns a safe free-plan default if the billing columns aren't migrated yet,
 * so the app never hard-fails before the migration is run.
 */
export async function getUserBilling(
  supabase: SupabaseClient,
  userId: string
): Promise<Billing> {
  const { data, error } = await supabase
    .from('profiles')
    .select(BILLING_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    // Columns missing (pre-migration) or row absent — treat as free.
    return toBilling({
      plan: 'free',
      analysis_count: 0,
      analysis_reset_date: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      priority_support: false,
      payment_failed: false,
    });
  }

  const row = data as ProfileBillingRow;
  const now = new Date();
  const reset = row.analysis_reset_date ? new Date(row.analysis_reset_date) : null;

  if (!reset || now >= reset) {
    const nextReset = startOfNextMonth(now).toISOString();
    row.analysis_count = 0;
    row.analysis_reset_date = nextReset;
    // Persist the rolled-over window. Best-effort: ignore failures.
    try {
      const admin = createAdminClient();
      await admin
        .from('profiles')
        .update({ analysis_count: 0, analysis_reset_date: nextReset })
        .eq('id', userId);
    } catch {
      /* non-fatal */
    }
  }

  return toBilling(row);
}

/** Increment a user's analysis counter by one (admin write). Best-effort. */
export async function incrementAnalysisCount(userId: string, current: number): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from('profiles')
      .update({ analysis_count: current + 1 })
      .eq('id', userId);
  } catch {
    /* non-fatal */
  }
}

/**
 * Apply a plan change from a Stripe event. Resets the usage window on upgrade and
 * clears any payment-failed flag. Written with the admin client.
 */
export async function applyPlanChange(params: {
  customerId: string;
  plan: PlanId;
  subscriptionId?: string | null;
  paymentFailed?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const planConfig = getPlan(params.plan);
  const update: Record<string, unknown> = {
    plan: params.plan,
    priority_support: planConfig.prioritySupport,
  };
  if (params.subscriptionId !== undefined) {
    update.stripe_subscription_id = params.subscriptionId;
  }
  if (params.paymentFailed !== undefined) {
    update.payment_failed = params.paymentFailed;
  }
  // Reset the usage window whenever we (re)activate a billing period.
  update.analysis_count = 0;
  update.analysis_reset_date = startOfNextMonth().toISOString();

  await admin.from('profiles').update(update).eq('stripe_customer_id', params.customerId);
}

/** Flip the payment-failed flag for a customer (admin write). */
export async function setPaymentFailed(customerId: string, failed: boolean): Promise<void> {
  const admin = createAdminClient();
  await admin.from('profiles').update({ payment_failed: failed }).eq('stripe_customer_id', customerId);
}

/**
 * Ensure the user has a Stripe customer, creating one if needed and persisting
 * the id back to their profile. Returns the customer id.
 */
export async function ensureStripeCustomer(params: {
  userId: string;
  email: string | null | undefined;
  existingCustomerId: string | null;
}): Promise<string> {
  if (params.existingCustomerId) return params.existingCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: params.email ?? undefined,
    metadata: { user_id: params.userId },
  });

  const admin = createAdminClient();
  await admin.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', params.userId);

  return customer.id;
}
