// ── MASTER PAYWALL SWITCH ────────────────────────────────────────────────────
// This one constant turns every subscription paywall in the app on or off.
//
//   false → every feature is unlocked for all signed-in users, regardless of
//           which plan they're actually on. No upgrade walls, no free-tier caps.
//   true  → subscription tiers are enforced again (the original behavior).
//
// HOW TO BRING THE PAYWALLS BACK: flip `PAYWALLS_DEFAULT` below to `true`, or set
// the env var PAYWALLS_ENABLED=true in .env.local / Vercel (the env var wins when
// present, so you can toggle in production without a code change).
//
// Everything that gates on a plan reads through this flag via getUserPlan()
// (see lib/subscription/server.ts) plus the free-analysis quota in
// app/api/analyses/route.ts — so this is the single place to change.

const PAYWALLS_DEFAULT = false; // ← current state: paywalls OFF

const envOverride = process.env.PAYWALLS_ENABLED;
export const PAYWALLS_ENABLED =
  envOverride === 'true' ? true : envOverride === 'false' ? false : PAYWALLS_DEFAULT;
