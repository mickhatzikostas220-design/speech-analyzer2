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
| `APP_ENCRYPTION_KEY` | **Agent:** long random string (`openssl rand -hex 32`) — encrypts users' API keys + OAuth tokens |
| `GOOGLE_CLIENT_ID` | **Agent (optional):** Google OAuth client ID for the Gmail connection |
| `GOOGLE_CLIENT_SECRET` | **Agent (optional):** Google OAuth client secret |

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

## Personal AI Agent

The **Assistant** tab is a personal AI agent for each user. It's a general assistant that's also aware of the user's own Orator speech analyses, and it can connect to outside apps (starting with Gmail).

**Setup**

1. Run the agent schema — in the Supabase SQL Editor, run `supabase/agent.sql`.
2. Set `APP_ENCRYPTION_KEY` (required) — this encrypts every user's API key and OAuth tokens at rest (AES-256-GCM). Without it, key storage and app connections are disabled.
3. (Optional) Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable the Gmail connection. In the Google Cloud console, create an OAuth client and add `<NEXT_PUBLIC_APP_URL>/api/agent/connect/google/callback` as an authorized redirect URI.

**How it works**

- **Bring your own key (required).** Each user adds their own OpenAI or Anthropic API key in **Assistant → Settings** and picks a model (or types a custom model ID). Usage is billed to them, not to you. Keys are validated on save and stored encrypted.
- **Speech-aware.** The agent has read-only tools to list and read the user's analyses, so it can answer questions, draft follow-ups, or repurpose talks.
- **Connected apps with user-controlled autonomy.** Each connection has a permission level the user sets:
  - *Read only* — search and read (e.g. inbox) but never write.
  - *Draft & confirm* — can also create drafts; never sends.
  - *Act directly* — can send/act on its own.
  The agent only ever sees the tools its permission level allows. Every write the agent performs is recorded in the `agent_actions` audit log.
- **Extensible.** Tools live in `lib/agent/tools/` and are assembled per-request in `lib/agent/tools/registry.ts`. One Google OAuth app unlocks Gmail today and Calendar / Drive later — add a connector file and register it.

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
