# Go-Live Checklist — Speaker Hub

**Updated 2026-07-23.** The site is **LIVE at https://speaker-hub.com**.

This is the plain-English list of what's already handled in the code and what
*you* still need to do outside the code (in Vercel, Supabase, Stripe, and with a
lawyer). Work top to bottom. Anything under "You need to do this" is a step only
you can take — Claude can't set your secret keys or flip dashboard toggles.

---

## What's already done in the code ✅

You don't need to touch any of this — it's noted so you know it's covered.

- **Builds, type-checks, and lints clean.** `npm run build`, `npx tsc --noEmit`,
  and `npm run lint` all pass with zero errors.
- **Security basics are in place.** Every private page redirects logged-out
  visitors to `/login`. API routes check who you are before returning data.
  Admin routes are locked to your email. Stored secrets (users' own API keys,
  Google tokens) are encrypted at rest. The Stripe webhook verifies its
  signature before changing anyone's plan. Public URL-fetching tools block
  requests to internal/private addresses (SSRF protection).
- **Abuse limits.** Signup, resend-code, access requests, and the AI tools are
  rate-limited so nobody can hammer them.
- **Legal pages use the right domain.** `/privacy`, `/terms`, and `/cookies`
  all use `@speaker-hub.com` addresses — not the old parked `speakerhub.app`.
- **SEO plumbing works.** `/robots.txt` and `/sitemap.xml` point at
  `speaker-hub.com`, and published one-sheets are added to the sitemap
  automatically.
- **Error screens are friendly.** A crash shows an on-brand "something went
  wrong" page with a reference code, never a raw stack trace.

---

## You need to do this before launch

### 1. Set the environment variables in Vercel

This is the one real gap. Vercel → your project → Settings → Environment
Variables. Copy the values from `.env.local.example`. **Set them for every
environment (Production *and* Preview)** — if a Supabase variable is missing at
build time, the whole deploy fails, not just one page.

Required for the app to work at all:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API.
- [ ] `OPENAI_API_KEY` — powers analysis, feedback, transcription, and every AI
      tool. This is the only AI key the app itself needs. (The AI Assistant lets
      users paste their *own* OpenAI or Anthropic key, so you don't set an
      Anthropic key here.)
- [ ] `NEXT_PUBLIC_APP_URL` = `https://speaker-hub.com` — used in emailed links,
      Google sign-in redirects, and SEO. The code defaults to the right domain
      in production, but set this so previews and emails are always correct.
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` on a **verified domain**, e.g.
      `Speaker Hub <hello@speaker-hub.com>`. The domain is already verified in
      Resend (see `docs/resend-domains.csv`). Without this, real signups won't
      receive their verification code.
- [ ] `ADMIN_EMAIL` = your email (defaults to yours if unset).
- [ ] `ADMIN_ACTION_SECRET` — a long random string, e.g. run
      `openssl rand -hex 32`. Signs the one-click approve/deny links in
      access-request emails. If it's unset, those links are simply left out and
      you approve requests from the `/admin` page instead.
- [ ] `APP_ENCRYPTION_KEY` — another `openssl rand -hex 32`. Required for the AI
      Assistant to encrypt users' saved keys and tokens.

Then **redeploy** — Vercel bakes these in at build time, so a save alone doesn't
apply them.

### 2. Flip one Supabase security toggle

Supabase → Authentication → Passwords → turn on **"Prevent use of leaked
passwords."** It's the only outstanding security-advisor warning, and it's a
dashboard-only setting.

If you ever point a new domain at the app: Supabase → Authentication → URL
Configuration → add it to the redirect allow-list, or email confirmation and
password reset links will bounce.

### 3. Have a lawyer look at the legal pages

- [ ] Get counsel to review `/privacy` and `/terms`. They're solid drafted
      baselines, but they're not legal advice — a real review matters most
      before you start charging money.

---

## When you're ready to charge money

Right now the app is in **free beta**: every signed-in user gets everything, and
billing is switched off on purpose. Two switches control this, and both can be
flipped with a Vercel environment variable — no code change needed:

- **`FREE_BETA`** (currently `true`): while true, checkout is disabled and the
  Plans page shows every tier as included. Set `FREE_BETA=false` to turn billing
  on.
- **`PAYWALLS_ENABLED`** (currently `false`): while false, no feature is gated by
  plan. Set `PAYWALLS_ENABLED=true` to start enforcing Free / Core / Full tiers.

Before you flip those, add your **live** Stripe values in Vercel:

- [ ] `STRIPE_SECRET_KEY` (live mode), `STRIPE_WEBHOOK_SECRET`,
      `STRIPE_PRICE_CORE`, `STRIPE_PRICE_FULL`. The code currently falls back to
      test-mode sandbox price IDs, so real charges won't work until you set the
      live ones.
- [ ] Point a Stripe webhook at `https://speaker-hub.com/api/subscription/webhook`
      and paste its signing secret into `STRIPE_WEBHOOK_SECRET`.

Per-feature keys are all optional — leave them blank and that feature just stays
off gracefully: `TRIBE_SERVER_URL`, `PARAKEET_SERVER_URL`, `YOUTUBE_API_KEY`,
`CLIPFLOW_RENDER_URL`, `CRON_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, and the
per-platform ClipFlow OAuth keys.

---

## After you deploy — quick smoke test

- [ ] Sign up with a real email → the verification code arrives → onboarding.
- [ ] Upload a talk → processing → results with score, timeline, transcript.
- [ ] Logged out, open `/keynotes` → you get redirected to `/login`.
- [ ] Fire 11 rapid uploads in a minute → the 11th is refused (rate limit works).
- [ ] Request a password reset → the email link lets you set a new password.
- [ ] `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` all load when
      logged out.
- [ ] If you've turned paywalls on: a free user is blocked after their free
      analyses, and the premium tools show upgrade screens.

---

## Nice-to-have, not blocking

These aren't launch blockers — note them for later:

- The AI transcription and compare-report routes are behind login but aren't
  rate-limited. If AI costs ever spike, add a per-user limit there like the
  other AI routes have.
- `robots.txt` currently allows crawling everything. The private app pages
  redirect crawlers to login anyway, so nothing sensitive leaks, but you could
  explicitly disallow `/api` and the app routes for tidiness.
