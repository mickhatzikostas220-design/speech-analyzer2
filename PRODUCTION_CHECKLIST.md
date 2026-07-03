# Go-Live Checklist — Speaker Hub

**Updated 2026-07-03.** The site is **LIVE at https://speaker-hub.com** ✅
(www redirects to the apex; the old `speech-analyzer2-rkgj.vercel.app` alias is
gone — the custom domain replaced it). Code side is done and build-verified.
Work top to bottom.

---

## 1. Merge / close the open PRs

- [ ] **Merge PR #63** (security hardening: editor IDOR, SSRF guard, storage
      RLS doc fix, AI cost limits, Next.js 14.2.35). Reviewed line-by-line —
      sound, clean against main, build passes. Note: its storage-policy SQL was
      checked against prod — the dangerous policy is **already absent**, so no
      database action is needed; the SQL file only fixes fresh installs.
- [ ] **Merge the `production-fixes-jul2` branch** (open PR:
      <https://github.com/mickhatzikostas220-design/speech-analyzer2/pull/new/production-fixes-jul2>)
      — contains the Resend domains CSV + email/canonical URL fixes.
- [ ] **Close PR #62 without merging** — it targets a months-old broken
      snapshot of main, is unmergeable, and everything it fixed has since been
      re-fixed on main.

## 2. Vercel environment variables (the one real config gap)

The production build has **no `NEXT_PUBLIC_APP_URL`** — the sitemap/robots
currently advertise an SSO-walled deployment URL, and (until the code fix in
§1 deploys) access-approval emails would link to localhost.

In Vercel → project → Settings → Environment Variables, add for Production:

- [ ] `NEXT_PUBLIC_APP_URL` = `https://speaker-hub.com`
- [ ] `EMAIL_FROM` = e.g. `Speaker Hub <hello@speaker-hub.com>` — the domain is
      **already verified in Resend** (DKIM + SPF ✅, see docs/resend-domains.csv),
      so real signups will receive their codes once this is set.
- [ ] Redeploy after saving (env vars bake in at build time).

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
