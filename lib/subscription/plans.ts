// Subscription tiers shown to the user. This is the presentation/source-of-truth
// for the three plans described in CLAUDE.md (Free, Core Premium, Full Premium).
//
// Prices are placeholders — set the real numbers and, once Stripe is connected,
// the matching price IDs in STRIPE_PRICE_* env vars (see lib/subscription/server.ts).
// Nothing here enforces gating; it's the surface that presents plans to the user.

export type PlanId = 'free' | 'core' | 'full';

/**
 * How many Speech Analyzer runs the Free plan allows per calendar month.
 * Single source of truth: the marketing copy, the Plans page feature list, and
 * the server-side enforcement in app/api/analyses all trace back here.
 */
export const FREE_MONTHLY_ANALYSES = 3;

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD. 0 = free. */
  price: number;
  tagline: string;
  /** Headline features included at this tier. */
  features: string[];
  /** Visually emphasize this plan as the recommended option. */
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Analyze your talks and find where the room leans in.',
    features: [
      `Speech Analyzer (${FREE_MONTHLY_ANALYSES} talks / month)`,
      'Talk Library',
      'Compare two talks',
    ],
  },
  {
    id: 'core',
    name: 'Core Premium',
    price: 19,
    tagline: 'Everything you need to prepare and sharpen every talk.',
    highlighted: true,
    features: [
      'Unlimited speech analyses',
      'Script Studio & Talk Editor',
      'Booking Inbox & public one-sheet',
      'Brand Kit personalization',
    ],
  },
  {
    id: 'full',
    name: 'Full Premium',
    price: 49,
    tagline: 'The full hub — AI assistant and automated clip publishing.',
    features: [
      'Everything in Core Premium',
      'AI Assistant (email, calendar, analytics)',
      'ClipFlow — auto clips + multi-platform posting',
      'Priority processing & support',
    ],
  },
];

export const PLAN_BY_ID: Record<PlanId, Plan> = PLANS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {} as Record<PlanId, Plan>
);

export function planRank(id: PlanId): number {
  return { free: 0, core: 1, full: 2 }[id];
}
