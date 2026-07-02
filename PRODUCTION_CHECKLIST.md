# Go-Live Checklist — Speaker Hub

The code is feature-complete and statically verified. These are the remaining
**external** steps to take it fully live. Work top to bottom; nothing here needs
a local build (Vercel compiles in the cloud), so a full C: drive doesn't block you.

---

## 1. Commit & push (VSCode — git isn't on your PATH)

- [ ] Open **Source Control** (`Ctrl+Shift+G`), stage all changes, commit.
- [ ] **Publish Branch** as `production-readiness` (not straight to `main`).
- [ ] On GitHub, open a **Pull Request** from that branch.

> Vercel builds a **Preview** automatically and posts pass/fail on the PR. That
> preview build is the real TypeScript/Next.js compile — the one verification
> that can't be done locally here.

## 2. Verify the build

- [ ] **Green check** on the PR → the build compiled clean. Merge to deploy.
- [ ] **Red check** → open "Details", copy the build log, and send it to Claude.
      Real compiler output = fast fix. (The build enforces **TypeScript** errors;
      ESLint is not run — see `memory` note / next.config.js.)

## 3. Database migrations (Supabase → SQL Editor)

**No new migration this session** — rate limiting is in-memory (`lib/rateLimit.ts`)
and needs no table. Run the baseline only if this is a fresh project:

- [ ] `supabase/schema.sql`, `access_requests.sql`, `brand.sql`, `gigs.sql`,
      `bookings.sql`, `onesheet.sql`, `subscription.sql`, `agent.sql`,
      `clipflow.sql`, `tips.sql`, `seo_tips.sql`
- [ ] Storage bucket: `insert into storage.buckets (id, name, public) values ('speeches','speeches',false);`

## 4. Environment variables (Vercel → Project → Settings → Environment Variables)

Copy from `.env.local.example`. **Required for a real launch:**

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `OPENAI_API_KEY` (powers analysis, feedback, Whisper, all app AI)
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` using a **verified domain** (the `resend.dev`
      default only delivers to you — real signups won't get their verification code)
- [ ] `NEXT_PUBLIC_APP_URL` (and/or `NEXT_PUBLIC_SITE_URL`) = your real production URL
- [ ] `ADMIN_EMAIL`
- [ ] Stripe **live** keys + price IDs when you're ready to charge:
      `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CORE`, `STRIPE_PRICE_FULL`
- [ ] `APP_ENCRYPTION_KEY` (required for the AI Assistant — `openssl rand -hex 32`)

Optional / per-feature (leave blank to disable gracefully): `TRIBE_SERVER_URL`,
`PARAKEET_SERVER_URL`, `YOUTUBE_API_KEY`, `CLIPFLOW_RENDER_URL`, `UPLOAD_POST_API_KEY`,
`GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`.

## 5. Domain & auth redirects

- [ ] Point your custom domain at the Vercel project.
- [ ] Set `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` to that domain.
- [ ] In **Supabase → Authentication → URL Configuration**, add the domain to the
      redirect allow-list (so email confirmation **and** password reset links work —
      the reset flow returns to `/auth/callback?next=/reset-password`).

## 6. Legal

- [ ] Have counsel review `/privacy` and `/terms` (drafted baselines) before charging.
- [ ] Set real contact emails in `app/privacy/page.tsx` and `app/terms/page.tsx`
      (currently `privacy@speakerhub.app` / `support@speakerhub.app`).

## 7. Post-launch smoke test

- [ ] Sign up with a real email → verification code arrives → land on onboarding.
- [ ] Upload a talk → processing screen shows elapsed time → results render.
- [ ] Results page shows score, engagement timeline, transcript with **words/wpm/pace**.
- [ ] Free plan: run 3 analyses → 4th is blocked with the upgrade prompt; the
      quota banner counts down on the analyzer + dashboard.
- [ ] Tier enforcement (free user): ClipFlow / AI Assistant / Talk Editor /
      Booking Inbox / public one-sheet / Brand Kit each show an upgrade screen
      instead of the tool; the dashboard shows Core/Full badges on locked tools.
      (Free tools stay open: Speech Analyzer, Talk Library, Compare. Onboarding
      still works on free.)
- [ ] Rate limit: 11 rapid `POST /api/analyses` in a minute → 11th returns 429.
- [ ] Password reset email arrives and the link lets you set a new password.
- [ ] Marketing page (`/`) renders for logged-out visitors; `/privacy`, `/terms`,
      `/robots.txt`, `/sitemap.xml` all load.

---

*Once §1–2 are green and §3–5 are set, the site is live and verified. §6 gates
charging real money; §7 confirms the consumer flows end-to-end.*
