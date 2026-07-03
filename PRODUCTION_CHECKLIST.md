# Go-Live Checklist — Speaker Hub

**Updated 2026-07-02 (evening).** The code side is done and build-verified.
Everything below is an owner action — none of it can be done from the repo.
Work top to bottom; §1 and §2 are the ones blocking the site right now.

---

## 1. 🔴 Restore public access (the site is currently unreachable)

`speech-analyzer2-rkgj.vercel.app` worked earlier today but now returns
**404 DEPLOYMENT_NOT_FOUND**, and every deployment URL redirects to a Vercel
login wall (Deployment Protection). Until fixed, nobody can reach the site.

In the Vercel dashboard → **speech-analyzer2-rkgj** project:

- [ ] **Settings → Domains** — confirm `speech-analyzer2-rkgj.vercel.app` (or
      your real domain) is listed and attached to Production. Re-add if missing.
- [ ] **Settings → Deployment Protection** — set to **Standard Protection**
      (production public, previews protected) or turn off Vercel Authentication
      for production.
- [ ] Reload the URL in a private window — the marketing page should render
      without a Vercel login.

## 2. Merge the pending PR (build already green)

- [ ] Open the PR for branch **`production-fixes-jul2`**:
      <https://github.com/mickhatzikostas220-design/speech-analyzer2/pull/new/production-fixes-jul2>
      and merge it. Both Vercel projects compiled it successfully, so the merge
      is safe. It contains: the AI-memory onboarding step, the `/keynotes`
      login-redirect fix, and the keynote RLS/index migration mirror.

## 3. Delete the duplicate Vercel project

Two Vercel projects build this repo on every push: **speech-analyzer2** and
**speech-analyzer2-rkgj** (the live one).

- [ ] Delete the **speech-analyzer2** project (Settings → Delete Project) so
      each push builds once.

## 4. Environment variables (Vercel → Settings → Environment Variables)

Copy from `.env.local.example`. Required for a real launch:

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `OPENAI_API_KEY` (powers analysis, feedback, Whisper, all app AI)
- [ ] `NEXT_PUBLIC_APP_URL` = your real public URL (the code's fallback is an
      SSO-protected deployment URL, so sitemap/canonical/emails need this set)
- [ ] `RESEND_API_KEY` + `EMAIL_FROM` on a **verified domain** (the `resend.dev`
      default only delivers to you — real signups won't get their code).
      Note: `speakerhub.app` is currently just registrar parking — the legal
      pages already use `privacy@`/`support@speakerhub.app`, so either finish
      setting up that domain or change those addresses.
- [ ] `ADMIN_EMAIL`, `ADMIN_ACTION_SECRET`
- [ ] `APP_ENCRYPTION_KEY` (required for the AI Assistant — `openssl rand -hex 32`)
- [ ] Stripe **live** keys + price IDs when ready to charge: `STRIPE_SECRET_KEY`,
      `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CORE`, `STRIPE_PRICE_FULL`

Optional / per-feature (blank = feature disables gracefully): `TRIBE_SERVER_URL`,
`PARAKEET_SERVER_URL`, `YOUTUBE_API_KEY`, `CLIPFLOW_RENDER_URL`, `UPLOAD_POST_API_KEY`,
`GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`.

## 5. Supabase (one toggle left)

Database is verified: all 28 tables have RLS, advisors are clean except one:

- [ ] **Authentication → Passwords → enable "Prevent use of leaked passwords"**
      (the only remaining security advisor warning; dashboard-only setting).
- [ ] If you point a custom domain at the app: **Authentication → URL
      Configuration** — add it to the redirect allow-list (email confirmation
      + password reset return to `/auth/callback?next=/reset-password`).

## 6. Paywalls (currently OFF on purpose)

`lib/subscription/config.ts` → `PAYWALLS_DEFAULT = false`: every signed-in user
gets full access; no quotas. To start enforcing tiers, flip it to `true` or set
`PAYWALLS_ENABLED=true` in Vercel env (env var wins; no code change needed).

## 7. Legal (gates charging money)

- [ ] Counsel review of `/privacy` and `/terms` (drafted baselines).
- [ ] Real contact emails in `app/privacy/page.tsx` / `app/terms/page.tsx`
      (currently the parked `speakerhub.app` addresses).

## 8. Post-launch smoke test

- [ ] Sign up with a real email → verification code arrives → onboarding
      (4 steps now — the new AI-memory step is step 2, skippable).
- [ ] Upload a talk → processing screen → results with score, timeline,
      transcript (words/wpm/pace).
- [ ] Logged out, visit `/keynotes` → redirected to `/login` (the fix in the PR).
- [ ] Rate limit: 11 rapid `POST /api/analyses` in a minute → 11th returns 429.
- [ ] Password reset email arrives and the link sets a new password.
- [ ] `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` load logged-out.
- [ ] When paywalls go ON: free user blocked after 3 analyses; ClipFlow /
      AI Assistant / Talk Editor / Booking Inbox / one-sheet / Brand Kit show
      upgrade screens; dashboard shows Core/Full badges on locked tools.

---

*§1–2 put the verified site back on the public internet. §4–5 make signup and
email real. §6–7 gate charging money. §8 confirms the flows end-to-end.*
