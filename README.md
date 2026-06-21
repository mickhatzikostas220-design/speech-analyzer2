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

---

## Script-matcher transcription (Parakeet v3)

The Studio script editor transcribes uploaded clips with self-hosted **NVIDIA
`parakeet-tdt-0.6b-v3`** on Modal (GPU), falling back to **OpenAI Whisper**
automatically when `PARAKEET_SERVER_URL` is unset. Parakeet's TDT decoder
predicts token durations directly, giving tighter word-level timestamps — and
since the matcher slices clips on `word.start` / `word.end`, that means cleaner
cuts. Only the transcription step changes; the JS fuzzy-matching algorithm in
`app/(app)/editor/script/[id]/page.tsx` is untouched and consumes the same
`{ word, start, end }` array regardless of engine.

Deploy:

```bash
pip install modal && modal token new
modal secret create parakeet-secret PARAKEET_SERVER_SECRET=$(openssl rand -hex 16)
modal deploy tribe-server/parakeet-modal.py
```

Then set the printed URL as `PARAKEET_SERVER_URL` (and the matching
`PARAKEET_SERVER_SECRET`) in your environment. Runs on an A10G (24 GB VRAM);
set `min_containers=1` in the Modal file to eliminate cold starts (~$1/hr idle).

---

## ClipFlow

ClipFlow turns long-form YouTube content into short-form vertical clips, writes
the copy with GPT-4o, and publishes to Instagram Reels, TikTok, YouTube Shorts,
and X — all inside the existing app, design system, and Supabase database.

Visit `/clipflow` while signed in.

### How it works

1. **Input** — paste a YouTube **video** or **channel** URL. Channel URLs use
   the channel's most recent upload. Metadata (title, description, duration,
   thumbnail) comes from the **YouTube Data API v3**; the transcript is fetched
   best-effort from YouTube's public caption tracks.
2. **Auto-clipping** — **OpenAI GPT-4o** scans the transcript for
   hooks, key points, emotional peaks, and quotable lines and proposes 3–10
   clips (15–90s each). Long videos are split into a bounded number of windows
   so cost and latency stay flat regardless of runtime.
3. **AI copy** — each clip gets a punchy title, an on-screen caption, a post
   description, and per-platform hashtags. Edit or **Regenerate** any of it.
4. **Render** — **FFmpeg + yt-dlp** download only the needed section, reframe to
   9:16, and burn in captions (opus / karaoke / minimal). Downloading just the
   `[start,end]` section is what lets 1-hour+ sources render without timing out.
5. **Publish** — toggle platforms per clip and **Post now** or **Schedule**.
   Post status (queued / scheduled / posting / posted / failed) is shown per
   platform.

### Data model

Five additive tables (see `supabase/clipflow.sql`, all `IF NOT EXISTS` and
RLS-protected): `clipflow_projects`, `clipflow_clips`, `clipflow_connections`,
`clipflow_posts`, and `clipflow_jobs`. Run the file in the Supabase SQL editor.

### Queue & scheduling

`clipflow_jobs` is a Postgres-backed work queue (serverless-safe — no Redis).
Scheduled posts are drained by `POST /api/clipflow/jobs/run`; wire it to a
scheduled trigger (e.g. a Vercel Cron every minute) with the `CRON_SECRET`
bearer token. The function signatures in `lib/clipflow/queue.ts` map 1:1 onto
BullMQ if you later move to Redis.

### Security

OAuth access/refresh tokens are encrypted with AES-256-GCM (`lib/clipflow/crypto.ts`)
before storage and are only ever decrypted server-side immediately before a
platform API call — they are never selected into any browser response.

### Configuration

ClipFlow degrades gracefully: it always shows the UI, and each capability turns
on as you add its credentials (see `.env.local.example`).

| Capability | Needs |
|------------|-------|
| Clip detection + AI copy | `OPENAI_API_KEY` (already set) |
| Video/channel lookup | `YOUTUBE_API_KEY` |
| Rendering the 9:16 MP4 | `CLIPFLOW_RENDER_URL` (Modal worker) — or `ffmpeg` + `yt-dlp` on the host |
| Token encryption | `CLIPFLOW_TOKEN_SECRET` (falls back to the service-role key) |
| Posting (recommended) | `UPLOAD_POST_API_KEY` — each speaker connects their own socials via an Upload-Post hosted link |
| Posting (direct) | that platform's `*_OAUTH_CLIENT_ID/SECRET` (+ an approved app) |
| Scheduled posting | `CRON_SECRET` + a scheduled trigger hitting `/api/clipflow/jobs/run` |

Until a platform's OAuth app is configured, its **Connect** button shows
"Not configured" rather than failing. Until `ffmpeg`/`yt-dlp` are present, clip
plans, captions, and copy still generate and preview (via the embedded YouTube
player) — only the exported file step reports that the tools are needed.

### Publishing via Upload-Post

Standing up an approved developer app for Instagram, TikTok, YouTube, and X is
the slowest part of going live. [Upload-Post](https://upload-post.com) — a
universal social publishing API — already owns those connections, so ClipFlow
publishes through it instead, **per speaker**:

1. Create an Upload-Post account and set `UPLOAD_POST_API_KEY` (dashboard → API
   Keys). This single account/key covers every speaker; billing is on it.
2. Each speaker, under **ClipFlow → "Publish accounts"**, clicks **Connect
   accounts** and authorizes their own TikTok / Instagram / YouTube / X through
   an Upload-Post hosted page — no API key for end users.
3. That speaker's clips publish to *their* connected accounts.

Under the hood each speaker is an Upload-Post **profile** (named `orator_<id>`).
The **Connected platforms** panel reflects that profile's linked accounts, and
**Post now / Schedule** sends the rendered 9:16 MP4 to `POST /api/upload` with
the speaker's profile and target platform. With `UPLOAD_POST_API_KEY` unset,
ClipFlow falls back to the per-platform OAuth path below — fully additive.

Implementation: `lib/clipflow/uploadpost.ts` (API client: profiles, hosted
connect link, publish), the `app/api/clipflow/uploadpost` route (status /
connect / disconnect), and the existing publish pipeline in
`lib/clipflow/runner.ts`.

> **Notes.** Upload-Post bundles upload + post into one call, so a clip's bytes
> are re-sent per platform; ClipFlow caches the download per clip so a multi-
> platform "post now" only fetches it once. The title field carries the caption
> (title + description + hashtags); per-platform specifics (e.g. YouTube title
> length, TikTok privacy) are handled by Upload-Post, and its error is surfaced
> verbatim on the post if something's rejected.

### Rendering off Vercel

Vercel's serverless functions don't include `ffmpeg` or `yt-dlp`, so the MP4
export step runs on a small **Modal worker** instead
(`tribe-server/clipflow-render-modal.py`, CPU-only — no GPU). The render route
uses it whenever `CLIPFLOW_RENDER_URL` is set and falls back to local rendering
otherwise.

```bash
pip install modal && modal token new
modal secret create clipflow-render-secret CLIPFLOW_RENDER_SECRET=$(openssl rand -hex 16)
modal deploy tribe-server/clipflow-render-modal.py
```

Paste the printed URL into `CLIPFLOW_RENDER_URL` (and the same secret into
`CLIPFLOW_RENDER_SECRET`). The worker downloads only the `[start,end]` section,
reframes to 1080×1920, burns the captions, and returns the MP4 — identical
output to the local path. If YouTube blocks the worker's datacenter IP, attach a
cookies file (see the note in the Modal file).
