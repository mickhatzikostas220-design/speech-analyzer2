// Central definition of the three subscription plans. Pure config — no secrets,
// safe to import on the client. Stripe price IDs live in env vars and are only
// read on the server (see lib/billing/server.ts).

export type PlanId = 'free' | 'core' | 'full';

export interface Plan {
  id: PlanId;
  name: string;
  /** Price in whole dollars per month, for display. */
  priceMonthly: number;
  /** Marketing tagline. */
  tagline: string;
  /** Max analyses per month. null = unlimited. */
  monthlyAnalysisLimit: number | null;
  /** Max upload size in bytes. */
  maxUploadBytes: number;
  /** Whether the AEO/SEO tool is unlocked. */
  aeoSeo: boolean;
  /** Whether the account carries the priority-support flag. */
  prioritySupport: boolean;
  /** Feature bullets for the pricing page. */
  features: string[];
}

const MB = 1024 * 1024;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    tagline: 'Kick the tires on every core tool.',
    monthlyAnalysisLimit: 3,
    maxUploadBytes: 10 * MB,
    aeoSeo: false,
    prioritySupport: false,
    features: [
      '3 analyses per month',
      'Uploads up to 10 MB',
      'Basic AI insights',
      'No payment required',
    ],
  },
  core: {
    id: 'core',
    name: 'Core Premium',
    priceMonthly: 20,
    tagline: 'For working speakers who analyze constantly.',
    monthlyAnalysisLimit: null,
    maxUploadBytes: 500 * MB,
    aeoSeo: false,
    prioritySupport: false,
    features: [
      'Unlimited analyses',
      'Uploads up to 500 MB',
      'Advanced AI insights — tone scoring, pacing breakdown, filler-word detection',
      'Access to all tools except the AEO/SEO tool',
    ],
  },
  full: {
    id: 'full',
    name: 'Full Premium',
    priceMonthly: 50,
    tagline: 'Everything, including discovery & search tooling.',
    monthlyAnalysisLimit: null,
    maxUploadBytes: 500 * MB,
    aeoSeo: true,
    prioritySupport: true,
    features: [
      'Everything in Core Premium',
      'Full access to the AEO/SEO tool',
      'Priority support flag on your account',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'core', 'full'];

/** Plans a user can actively subscribe to via Stripe Checkout. */
export const PAID_PLANS: Exclude<PlanId, 'free'>[] = ['core', 'full'];

export function getPlan(id: string | null | undefined): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS.free;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
