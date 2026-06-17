# Orator — Neural Speech Analysis

Orator analyzes speeches and presentations using the Tribe v2 fMRI-based neural engagement model. Upload a video or audio file, get a full transcript, and receive timestamped feedback on exactly where audience attention drops — and why.

**Invite-only.** Access is gated behind a request-approval flow managed via the admin panel.

---

## Stack

- **Frontend + API**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Auth + DB + Storage**: Supabase
- **Transcription**: OpenAI Whisper
- **Feedback generation**: OpenAI GPT-4o
- **Neural engagement model**: Facebook Research Tribe v2 (GPU server, optional — falls back to mock)
- **Email**: Resend
- **GPU deployment**: Modal.com

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd speech-analyzer
npm install
```

### 2. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, then:

**Run the database schema** — open SQL Editor in your Supabase dashboard and run these files:

```
supabase/schema.sql
supabase/access_requests.sql
supabase/brand.sql          # per-speaker branding (colors, logo, fonts, voice)
supabase/gigs.sql           # speaking gigs + connected calendar feed
supabase/bookings.sql       # booking inbox (incoming speaking inquiries)
supabase/onesheet.sql       # public speaker one-sheet (URL slug)
```

**Create the storage bucket** — in the same SQL Editor, run:

```sql
insert into storage.buckets (id, name, public) values ('speeches', 'speeches', false);
```

### 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in every value:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings → API (service_role, keep secret) |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `RESEND_API_KEY` | resend.com → API keys |
| `ADMIN_EMAIL` | Your email — this address gets access to /admin |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3002` for local dev |
| `TRIBE_SERVER_URL` | Leave blank to use mock data (see GPU server section) |
| `TRIBE_SERVER_SECRET` | Optional bearer token for your GPU server |

### 4. Run locally

```bash
npm run dev
```

App runs at `http://localhost:3002` (or check your `package.json` dev script).

---

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project in [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.local.example` in Vercel's project settings
4. Set `NEXT_PUBLIC_APP_URL` to your production Vercel URL
5. Deploy

---

## Deploying the Tribe v2 GPU server (Modal.com)

The GPU server runs the actual neural engagement model. Without it, every analysis uses realistic mock data — useful for testing, but not real fMRI predictions.

### Prerequisites

- A [Modal.com](https://modal.com) account
- Access to the [Facebook Research Tribe v2 repo](https://github.com/facebookresearch/tribev2) (CC-BY-NC-4.0 license — non-commercial use only)

### Steps

**1. Install Modal**

```bash
pip install modal
modal token new
```

**2. Install Tribe v2 dependencies**

The `tribe-server/requirements.txt` references the Tribe v2 package. Since it's a gated GitHub repo, you may need to clone it first and install locally, then reference the local path — or request access via Facebook Research.

**3. Set the auth secret (optional)**

```bash
modal secret create tribe-server TRIBE_SERVER_SECRET=your-secret-token
```

**4. Deploy**

```bash
cd tribe-server
modal deploy deploy-modal.py
```

Modal will output a URL like `https://your-name--tribe-server.modal.run`. Set this as `TRIBE_SERVER_URL` in your Vercel environment variables.

**5. Verify**

```bash
curl https://your-name--tribe-server.modal.run/health
```

---

## Admin panel

Visit `/admin/requests` while signed in with your `ADMIN_EMAIL` account. From here you can:

- **Approve** access requests — sends an invite email via Resend with a one-time signup link
- **Deny** requests — sends a rejection email

To add additional admins, change `ADMIN_EMAIL` to the new admin's email, or modify the check in `app/admin/layout.tsx` to allow multiple emails.

---

## Per-speaker branding (Speaker Hub)

The hub is built on the **Hatzikostas — Speaker Hub** design system (ported into
`app/brand-tokens.css` as CSS variables) and is **customized to each speaker's
brand**. The Hatzikostas palette is just the default seed.

**How it works**

- On first sign-in, a speaker is sent to **`/onboarding`**, enters their website,
  and we **auto-extract** their brand — signature + accent colors, logo / favicon,
  web fonts, hero image, and an "about" blurb — straight from the page markup
  (`lib/brand/extract.ts`, no third-party service).
- The kit is saved to `profiles.brand` (jsonb) and turned into a small set of CSS
  variable overrides (`lib/brand/theme.ts`) applied on the app shell, so the whole
  token system re-skins to them with no flash.
- Speakers can fine-tune everything later under **`/settings`** — colors, logo,
  fonts, voice/tone, and hero image — or re-import from a different URL.

**Key files**

| Area | Path |
|------|------|
| Design tokens (defaults) | `app/brand-tokens.css` |
| Brand kit type + defaults | `lib/brand/types.ts`, `lib/brand/defaults.ts` |
| Website extraction | `lib/brand/extract.ts` |
| Kit → CSS variables | `lib/brand/theme.ts` |
| Onboarding / Settings UI | `components/brand/*`, `app/onboarding`, `app/(app)/settings` |
| API | `app/api/brand/route.ts`, `app/api/brand/extract/route.ts` |
| Migration | `supabase/brand.sql` |

**Note on auto-extraction:** it makes a server-side `fetch` to the speaker's site,
so it depends on your deployment's outbound-network policy. Some sites sit behind
bot protection (Cloudflare/Akamai) and may refuse the request — onboarding falls
back to the default look, and the speaker can adjust colors/logo/fonts in Settings.

> The re-skin in this pass is focused on the **layout/shell** (ink top bar, auth,
> onboarding, settings, dashboard). Deeper tool screens (analysis detail, editor,
> timeline, compare, admin) keep their original dark canvas for now and are
> wrapped so the light brand never bleeds in — they're the next surfaces to re-skin.

## Hub home

`/dashboard` is the **Speaker Hub command center**, laid out to follow the design
system's hub kit:

- **Hero** greeting in the speaker's voice + a **New talk** button (→ `/analyze`,
  which hosts the upload flow).
- **Tool grid** of the real, working tools — Speech Analyzer, Script Studio,
  Talk Editor, Compare, Talk Library, and Brand Kit.
- **Recent activity** and **season stats** (talks analyzed, average & best score)
  derived from real analysis data.
- **Upcoming gigs** — add gigs by hand, or **connect a calendar app** by pasting
  its iCal/ICS link (Google, Outlook, and Apple all expose one). Events are merged
  with manual gigs and shown by date. Parser: `lib/gigs/ics.ts`; data: `supabase/gigs.sql`.

> Connecting a calendar does a server-side `fetch` of the ICS URL, so (like brand
> extraction) it depends on your deployment's outbound-network policy.

## Personal AI Agent

The **Assistant** tab (and hub tile) is a personal AI agent for each speaker — a
general assistant that's also aware of their own Orator analyses and can connect to
outside apps (starting with Gmail).

**Setup**

1. Run `supabase/agent.sql` in the Supabase SQL editor.
2. Set `APP_ENCRYPTION_KEY` (required) — encrypts every user's API key + OAuth tokens
   at rest (AES-256-GCM). Without it, key storage and connections are disabled.
3. (Optional) Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the Gmail connection;
   add `<NEXT_PUBLIC_APP_URL>/api/agent/connect/google/callback` as an authorized
   redirect URI in your Google OAuth client.

**How it works**

- **Bring your own key.** Each user adds their own OpenAI or Anthropic key in
  **Assistant → Settings** and picks a model. Usage is billed to them; keys are
  validated on save and stored encrypted.
- **Speech-aware.** Read-only tools let it list and read the user's analyses to answer
  questions, draft follow-ups, or repurpose talks.
- **Connected apps with user-controlled autonomy** (*read only* / *draft & confirm* /
  *act directly*). The model only ever sees the tools its level allows; every write is
  recorded in the `agent_actions` audit log.
- **Extensible.** Tools live in `lib/agent/tools/` and are assembled per request in
  `lib/agent/tools/registry.ts`.

## Booking Inbox & public one-sheet

Two speaker-business tools that work together:

- **Booking Inbox** (`/bookings`) — a lightweight CRM pipeline for incoming
  speaking inquiries (new → in discussion → confirmed → completed/declined). Add
  inquiries by hand, track contact/fee/date, and push a confirmed booking onto the
  gigs calendar with one click. Data: `supabase/bookings.sql`; API: `app/api/bookings/*`.
- **Public one-sheet** (`/s/<slug>`) — a shareable, fully brand-themed speaker page
  (headline, bio, signature talks, testimonials) with a “book me” form. Submissions
  land straight in the speaker's Booking Inbox (`source = one_sheet`). Edit it under
  **Settings → Public one-sheet**. Content lives in `profiles.brand.oneSheet`; the
  URL slug is `profiles.slug` (`supabase/onesheet.sql`). Public capture endpoint:
  `app/api/public/inquiry`.

## Analysis export

On any completed analysis page, you can export:

- **Transcript (.txt)** — plain text with score and date header
- **Feedback (.csv)** — timestamped engagement drops with suggestions, importable in Excel/Sheets
- **Full report (.json)** — complete machine-readable export of all analysis data

---

## Architecture

```
Browser
  └─ Next.js App Router (Vercel)
       ├─ /app/(auth)/*        Login, signup, verify-email
       ├─ /app/(app)/*         Dashboard, history, analysis detail
       ├─ /app/admin/*         Access request management
       ├─ /app/request-access  Public access request form
       └─ /api/*               Route handlers
            ├─ /api/analyses                    CRUD
            ├─ /api/analyses/[id]/process       Transcribe + analyze + feedback (300s timeout)
            ├─ /api/analyses/[id]/export        Download transcript/feedback
            └─ /api/admin/requests/*            Approve/deny access requests

Supabase
  ├─ Auth          Email/password + invite links
  ├─ PostgreSQL    analyses, feedback_points, engagement_timeline, access_requests
  └─ Storage       speeches bucket (private, per-user RLS)

External Services
  ├─ OpenAI Whisper    Audio transcription
  ├─ OpenAI GPT-4o     Coaching feedback generation
  ├─ Tribe v2 server   Neural engagement scoring (Modal.com GPU)
  └─ Resend            Transactional email
```

---

## Known limitations

- **Tribe v2 ROI indices** in `tribe-server/main.py` are approximate fsaverage5 vertices. For production-accuracy, replace with Glasser 360-parcel atlas indices.
- **Waveform visualization** for audio files uses a static placeholder, not real frequency data.
- **No rate limiting** on API routes — consider adding Upstash or similar before opening to many users.
- **Tribe v2 is CC-BY-NC-4.0** — non-commercial use only.
