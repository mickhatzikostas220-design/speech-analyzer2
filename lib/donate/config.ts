// Donation settings for the public /donate page. This is the single place to
// tweak the suggested amounts and the optional third-party donation link, so the
// page and API code never need to be touched to adjust them.

// Suggested one-tap amounts, in whole US dollars. Donors can also type a custom
// amount. These apply to both one-time and monthly gifts.
export const DONATE_PRESETS = [5, 15, 50] as const;

// Guardrails for the custom amount (US dollars). Stripe rejects anything under
// ~$0.50, and the upper bound is just a sanity cap to avoid fat-finger mistakes.
export const DONATE_MIN = 1;
export const DONATE_MAX = 5000;

// Optional third-party donation link (Venmo). Leave `url` empty to hide the
// button entirely — nothing breaks. To turn it on, paste Mick's Venmo profile
// URL, which looks like: https://venmo.com/u/<your-venmo-username>
// (or https://account.venmo.com/u/<your-venmo-username>).
export const DONATE_EXTERNAL: { url: string; label: string } = {
  url: 'https://venmo.com/u/mick-hatzi',
  label: 'Donate with Venmo',
};
