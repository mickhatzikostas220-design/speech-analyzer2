# CLAUDE.md — Speech Analyzer 2

This file tells Claude Code exactly how to work on this project.
Read it fully before touching any code.

---

## What This Project Is

Speech Analyzer 2 is a web app built for public speakers.
It is a hub of tools that help speakers prepare, analyze, and improve their performances.
It is deployed on Vercel at: https://speaker-hub.com

---

## Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Auth + Database:** Supabase (@supabase/ssr, @supabase/supabase-js)
- **AI:** Anthropic SDK (@anthropic-ai/sdk), OpenAI SDK (openai)
- **Video/Media:** Remotion (@remotion/player, @remotion/preload), FFmpeg (@ffmpeg/ffmpeg, fluent-ffmpeg)
- **Email:** Resend
- **UI:** Lucide React icons, clsx for class names
- **File Uploads:** react-dropzone

---

## Focus Areas

When Mick opens this project, Claude Code should be ready to help with all of the following:

### 1. Adding New Tools and Features
- This app is a hub. New tools for speakers will be added over time.
- Each tool should live in its own folder under `/app` or `/components`.
- Before building anything new, ask what the tool does and who it is for.
- Keep tools modular so they do not break each other.

### 2. Fixing Bugs and Polish
- If something looks broken, explain what is wrong and why before fixing it.
- Do not silently change things. Always say what you changed and why.
- After fixing a bug, explain how to verify the fix works.

### 3. Stripe and Payments
- The app has Free, Core Premium, and Full Premium tiers.
- Stripe handles payments. Always check which tier a feature belongs to before building it.
- Never expose secret keys. All Stripe keys go in `.env.local` only.
- If adding a new paid feature, explain which tier it should sit behind and why.

### 4. Keeping Legal Pages Current
- The legal pages live at `/app/privacy/page.tsx` (Privacy Policy) and `/app/terms/page.tsx`
  (Terms of Service). They are linked from the landing-page footer.
- **Keep them in sync with the app.** Whenever a change materially affects data handling,
  features, plans/pricing, or third-party integrations, update the relevant legal page in the
  SAME task. Examples that require a legal update: collecting a new type of data, adding an AI
  or other third-party provider, connecting external accounts (e.g. social platforms), changing
  what data is shared, or changing the plan/billing structure.
- When you edit a legal page, bump its `updated="..."` date to the current date, and tell Mick
  in plain English exactly what you changed and why.
- **Contact + domain rule:** legal contact emails and any hardcoded domain must use the owned,
  verified domain `speaker-hub.com` — never the parked `speakerhub.app`. Do not invent a
  contact address on a domain the business does not control.
- These pages are a legal baseline, not legal advice. When a change has real legal weight,
  make the update but flag clearly that Mick should have counsel review it.
- **Scope note:** this is a deliberate, narrow exception to the "Stay In Your Lane" rule below —
  legal pages may be updated alongside a feature change even if Mick did not name them, *because*
  the feature change made them out of date. If unsure whether a change needs a legal update, ask.

---

## How to Work With Mick

- **Explain everything.** Do not assume Mick knows why you made a choice. Say it out loud.
- Before writing code, say what you are about to do in plain English.
- After writing code, explain what it does line by line if it is complex.
- If there are multiple ways to solve something, list the options and recommend one. Say why.
- Never skip steps. Do not assume something is obvious.

---

## Project Rules

- Use TypeScript. No plain `.js` files unless absolutely necessary.
- Use Tailwind for all styling. No inline styles or separate CSS files unless required.
- Use Supabase for auth and data. Do not build a custom auth system.
- Keep API keys and secrets in `.env.local` only. Never hardcode them.
- Use the Anthropic SDK (not raw fetch) when calling Claude.
- Use the App Router pattern (Next.js 14). Do not use the Pages Router.
- Every new page or component gets a comment at the top explaining what it does.

---

## File Structure to Know

```
/app              — Next.js App Router pages and layouts
/components       — Reusable UI components
/lib              — Shared utilities, Supabase client, helpers
/public           — Static assets
.env.local        — Secret keys (never commit this)
```

---

## Environment Variables Needed

Make sure these exist in `.env.local` before running the app:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=       # powers all app-wide AI (GPT-4o) + Whisper transcription
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
```

---

## Commands

```bash
npm run dev       # Start local dev server
npm run build     # Build for production
npm run lint      # Run ESLint
```

---

## What Not to Do

- Do not remove features without asking first.
- Do not change the Stripe tier structure without confirming with Mick.
- Do not use the Pages Router. This project uses the App Router only.
- Do not commit `.env.local` or any file containing secrets.
- Do not use `any` as a TypeScript type unless there is no other option.

---

## Scope Rule — Stay In Your Lane

This is the most important rule.

Only touch files that are directly related to the task Mick gave you.

If Mick asks you to fix a bug in the speech analysis tool, do not:
- Refactor unrelated components
- Rename variables in other files
- Reformat code you were not asked to touch
- Add or remove imports in files outside the task scope
- "Clean up" anything that was not mentioned

Before editing any file, ask yourself: did Mick ask me to change this?
If the answer is no, leave it alone.

If you notice something broken or messy in an unrelated file, point it out in a comment at the end of your response. Do not fix it unless Mick says to.
