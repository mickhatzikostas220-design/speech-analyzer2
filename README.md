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

**Run the database schema** — open SQL Editor in your Supabase dashboard and run both files:

```
supabase/schema.sql
supabase/access_requests.sql
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

## ClipFlow

ClipFlow turns long-form YouTube content into short-form vertical clips, writes
the copy with Claude, and publishes to Instagram Reels, TikTok, YouTube Shorts,
and X — all inside the existing app, design system, and Supabase database.

Visit `/clipflow` while signed in.

### How it works

1. **Input** — paste a YouTube **video** or **channel** URL. Channel URLs use
   the channel's most recent upload. Metadata (title, description, duration,
   thumbnail) comes from the **YouTube Data API v3**; the transcript is fetched
   best-effort from YouTube's public caption tracks.
2. **Auto-clipping** — **Claude (`claude-sonnet-4-6`)** scans the transcript for
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

`clipflow_jobs` is a Postgres-backed work queue (the "Bull or similar"
requirement, serverless-safe — no Redis). Scheduled posts are drained by
`POST /api/clipflow/jobs/run`; wire it to a scheduled trigger (e.g. a Vercel
Cron every minute) with the `CRON_SECRET` bearer token. The function signatures
in `lib/clipflow/queue.ts` map 1:1 onto BullMQ if you later move to Redis.

### Security

OAuth access/refresh tokens are encrypted with AES-256-GCM (`lib/clipflow/
crypto.ts`) before storage and are only ever decrypted server-side immediately
before a platform API call — they are never selected into any browser response.

### Configuration

ClipFlow degrades gracefully: it always shows the UI, and each capability turns
on as you add its credentials (see `.env.local.example`).

| Capability | Needs |
|------------|-------|
| Clip detection + AI copy | `ANTHROPIC_API_KEY` |
| Video/channel lookup | `YOUTUBE_API_KEY` |
| Rendering the 9:16 MP4 | `ffmpeg` + `yt-dlp` on the server |
| Token encryption | `CLIPFLOW_TOKEN_SECRET` (falls back to the service-role key) |
| Posting to a platform | that platform's `*_OAUTH_CLIENT_ID/SECRET` (+ an approved app) |
| Scheduled posting | `CRON_SECRET` + a scheduled trigger hitting `/api/clipflow/jobs/run` |

Until a platform's OAuth app is configured, its **Connect** button shows
"Not configured" rather than failing. Until `ffmpeg`/`yt-dlp` are present,
clip plans, captions, and copy still generate and preview (via the embedded
YouTube player) — only the exported file step reports that the tools are needed.

---

## Known limitations

- **Tribe v2 ROI indices** in `tribe-server/main.py` are approximate fsaverage5 vertices. For production-accuracy, replace with Glasser 360-parcel atlas indices.
- **Waveform visualization** for audio files uses a static placeholder, not real frequency data.
- **No rate limiting** on API routes — consider adding Upstash or similar before opening to many users.
- **Tribe v2 is CC-BY-NC-4.0** — non-commercial use only.
