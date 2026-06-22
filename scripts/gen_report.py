#!/usr/bin/env python3
"""Generate the security & maintenance report PDF for the Orator app."""
from fpdf import FPDF
from datetime import date

ACCENT = (124, 58, 237)   # purple
DARK = (24, 24, 27)
GRAY = (113, 113, 122)
RED = (185, 28, 28)
ORANGE = (180, 83, 9)
GREEN = (21, 128, 61)


def clean(s: str) -> str:
    repl = {
        "—": "-", "–": "-", "→": "->", "←": "<-",
        "‘": "'", "’": "'", "“": '"', "”": '"',
        "…": "...", "•": "-", " ": " ", "✓": "[x]",
        "×": "x", "≤": "<=", "≥": ">=",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


class PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 8, "Orator - Security & Maintenance Report", align="L")
        self.cell(0, 8, date.today().isoformat(), align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GRAY)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


pdf = PDF()
pdf.set_auto_page_break(auto=True, margin=16)
pdf.add_page()


def h1(t):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(pdf.epw, 8, clean(t))
    pdf.ln(1)


def h2(t):
    pdf.ln(2)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(pdf.epw, 7, clean(t))
    pdf.ln(0.5)


def body(t, color=DARK):
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*color)
    pdf.multi_cell(pdf.epw, 5, clean(t))
    pdf.ln(0.5)


def bullet(t, color=DARK, indent=4):
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*color)
    pdf.set_x(pdf.l_margin + indent)
    pdf.multi_cell(pdf.epw - indent, 5, clean("- " + t))
    pdf.set_x(pdf.l_margin)


def tag(label, color):
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(255, 255, 255)
    pdf.set_fill_color(*color)
    pdf.cell(pdf.get_string_width(label) + 6, 6, clean(label), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(0.5)


# ---- Cover ----
pdf.ln(20)
pdf.set_font("Helvetica", "B", 26)
pdf.set_text_color(*ACCENT)
pdf.multi_cell(pdf.epw, 12, "Orator")
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(*DARK)
pdf.multi_cell(pdf.epw, 9, "Security Review & Maintenance Report")
pdf.ln(4)
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(*GRAY)
pdf.multi_cell(pdf.epw, 6, clean(
    "Neural speech-analysis SaaS - Next.js 14 (App Router) + Supabase\n"
    f"Date: {date.today().isoformat()}\n"
    "Branch: claude/compassionate-brahmagupta-68pqyf\n"
    "Scope: full codebase, all API routes, RLS schemas, and the live Supabase project"
))
pdf.ln(6)
pdf.set_draw_color(*ACCENT)
pdf.set_line_width(0.8)
pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
pdf.ln(6)

pdf.set_font("Helvetica", "B", 12)
pdf.set_text_color(*DARK)
pdf.multi_cell(pdf.epw, 7, "Executive summary")
body(
    "A full security pass was run across the application code and the connected Supabase "
    "project. One critical data-exposure flaw was found and fixed in the database, several "
    "high-severity code vulnerabilities were remediated, and the Supabase advisor warnings "
    "were cleared (security and performance). All changes type-check cleanly."
)
pdf.ln(1)
body("Headline result:", DARK)
bullet("CRITICAL fixed: any signed-in user could download every other user's private speech "
       "recordings (over-permissive storage RLS policy). Closed in the live database.", RED)
bullet("4 critical/high code issues fixed: command injection (RCE), two SSRF vectors, and an "
       "unauthenticated paid-LLM endpoint.", ORANGE)
bullet("9 hardening fixes: admin-token forgery, email HTML injection, timing-safe secret checks, "
       "upload size/type limits, and removal of permissive insert policies.", ORANGE)
bullet("Supabase advisors: security warnings reduced from 8 to 2 (the 2 remaining are by-design "
       "or an auth-console toggle); 35+ performance warnings cleared.", GREEN)
bullet("Dependencies: high-severity npm advisories reduced from 14 to 8 (non-breaking fixes "
       "applied; remainder require a Next.js major upgrade - see recommendations).", GREEN)

# ---- Part A: Supabase ----
pdf.add_page()
h1("Part A - Supabase (applied to the live database)")
body("All migrations below were applied to project tmjyujpprveeqhorjcgt and mirrored into the "
     "repo SQL files. They are idempotent and recorded in supabase/security_hardening.sql.")

h2("A1. CRITICAL - private speech recordings were world-readable")
tag("CRITICAL - FIXED", RED)
body("The storage policy \"Service reads speeches\" granted SELECT on every object in the private "
     "'speeches' bucket to the public role (anon + authenticated). Combined with the public anon "
     "key, any authenticated user could list and download any other user's uploaded speech/video "
     "files - a horizontal access-control break (IDOR). The server's service-role key already "
     "bypasses RLS, so the policy was never needed.")
body("Fix: dropped the policy. Per-user \"Users read own speeches\" remains, so owners still read "
     "their own files and the server still reads everything via the service role.")

h2("A2. brand-assets bucket allowed full file enumeration")
tag("LOW - FIXED", ORANGE)
body("The public 'brand-assets' bucket had a broad SELECT policy that let any client LIST every "
     "file. Public buckets serve objects via their public URL without such a policy, so it was "
     "dropped (image src references are unaffected).")

h2("A3. Permissive INSERT policies on feedback_points / engagement_timeline")
tag("MEDIUM - FIXED", ORANGE)
body("Both tables had INSERT policies using WITH CHECK (true), granting insert to every role with "
     "no ownership tie - a user could inject fake feedback/timeline rows against any analysis. The "
     "only legitimate writer is the Modal GPU callback (service-role key, bypasses RLS), so the "
     "policies were dropped.")

h2("A4. SECURITY DEFINER function hardening")
tag("WARN - FIXED", ORANGE)
body("public.handle_new_user() had a mutable search_path and was directly executable by anon / "
     "authenticated via PostgREST RPC. Fix: pinned search_path = '' and revoked EXECUTE from "
     "public/anon/authenticated. The signup trigger still fires normally.")

h2("A5. RLS performance - auth.uid() re-evaluated per row")
tag("PERF - FIXED", GREEN)
body("35+ policies called auth.uid() once per row. Rewrote them as (select auth.uid()) so Postgres "
     "evaluates it once per query. Access logic is identical; clears advisor 0003.")

h2("A6. Missing covering indexes on foreign keys")
tag("PERF - FIXED", GREEN)
body("Added 11 covering indexes for foreign keys flagged by advisor 0001 (analyses.user_id, "
     "feedback_points.analysis_id, all clipflow_* and agent_* FKs, etc.).")

h2("A7. Remaining advisor items (not auto-fixable / by design)")
bullet("access_requests INSERT WITH CHECK (true): intentional - the public request-access form "
       "must accept anonymous submissions. Recommend app-layer rate limiting (see C-list).")
bullet("Leaked password protection disabled: enable in Supabase Auth -> Settings (console toggle, "
       "cannot be set via SQL).")

# ---- Part B: Code ----
pdf.add_page()
h1("Part B - Application code fixes")

h2("B1. Command injection / RCE in ClipFlow renderer")
tag("CRITICAL - FIXED", RED)
body("lib/clipflow/clipper.ts built shell command strings with a YouTube video ID interpolated "
     "directly into yt-dlp/ffmpeg via exec(). The ID came from a user-pasted URL with no character "
     "validation, so a crafted URL could execute arbitrary commands as the server user.")
body("Fix: (1) switched all three exec() calls to execFile() with argv arrays (no shell); "
     "(2) strict validation - video IDs must match ^[A-Za-z0-9_-]{11}$ at parse time "
     "(lib/clipflow/youtube.ts) and again before rendering. Channel IDs/handles/usernames are "
     "now allow-listed too.")

h2("B2. SSRF via user-supplied URLs (calendar ICS + website brand import)")
tag("CRITICAL/HIGH - FIXED", RED)
body("Both the connected-calendar ICS fetch (lib/gigs/ics.ts) and the brand/website extractor "
     "(lib/brand/extract.ts) fetched arbitrary user URLs with follow-redirects and no protection "
     "against internal targets - allowing requests to localhost, RFC1918 ranges, and the cloud "
     "metadata endpoint (169.254.169.254). The brand extractor also reflected scraped content back "
     "to the caller, enabling exfiltration of internal responses.")
body("Fix: added a shared guard lib/security/ssrf.ts (safeFetch / assertPublicUrl) that resolves "
     "the hostname, rejects loopback/private/link-local/CGNAT/multicast addresses (IPv4 + IPv6, "
     "incl. IPv4-mapped), and follows redirects manually - re-validating every hop. Both call "
     "sites now route through it.")

h2("B3. Unauthenticated, unmetered paid-LLM endpoint")
tag("CRITICAL - FIXED", RED)
body("/api/compare-report had no auth check (middleware excludes /api), so anyone on the internet "
     "could trigger GPT-4o calls - unbounded paid-API cost. User input was also interpolated into "
     "the prompt unvalidated, and missing fields threw unhandled 500s.")
body("Fix: added a getUser() 401 gate; tone/audience/length/sections validated against fixed "
     "allow-lists; labels and metrics coerced/bounded; body parsing and the OpenAI call wrapped in "
     "try/catch with generic errors.")

h2("B4. Forgeable admin approve/deny tokens")
tag("HIGH - FIXED", ORANGE)
body("lib/adminToken.ts fell back to a hardcoded HMAC secret ('fallback-secret-change-me') when "
     "ADMIN_ACTION_SECRET was unset. Those tokens are the ONLY auth on /api/admin/action (which "
     "approves access and mints invite links), so a shipped default allowed self-approval. "
     "Fix: throw if the secret is unset (no default) and compare signatures with timingSafeEqual.")

h2("B5. HTML injection into admin notification email")
tag("HIGH - FIXED", ORANGE)
body("Public, untrusted name/email/reason from the request-access form were interpolated unescaped "
     "into the admin notification email (a phishing vector against the admin who holds approve "
     "power). Fix: all user values are HTML-escaped in lib/email.ts.")

h2("B6. Upload size / type limits")
tag("HIGH - FIXED", ORANGE)
body("/api/transcribe buffered and forwarded arbitrarily large blobs to a paid API; the editor "
     "upload route buffered whole files in memory and trusted the client-supplied content type. "
     "Fix: 25 MB cap on transcribe (matches Whisper's limit); 200 MB cap + extension allow-list + "
     "server-derived content type on editor upload.")

h2("B7. Non-constant-time secret comparison (cron worker)")
tag("MEDIUM - FIXED", ORANGE)
body("/api/clipflow/jobs/run compared the CRON_SECRET bearer token with ===. Switched to a "
     "length-checked timingSafeEqual.")

# ---- Part C: deps + outstanding ----
pdf.add_page()
h1("Part C - Dependencies")
body("npm audit reported 14 vulnerabilities. The non-breaking fixes were applied (npm audit fix), "
     "clearing the high-severity form-data CRLF injection plus js-yaml, minimatch (ReDoS), and "
     "uuid issues - down to 8.")
body("The remaining 8 are all in next@14.2.29 (and its bundled postcss) and the eslint glob/"
     "minimatch dev chain; clearing them requires a major upgrade. Note: the critical Next.js "
     "middleware auth-bypass (CVE-2025-29927, fixed in 14.2.25) does NOT apply here - this app is "
     "already on 14.2.29. The remaining Next advisories are mostly DoS / image-optimizer / cache. "
     "Recommend upgrading to the latest 14.2.x patch and testing, then evaluating Next 15.")

h1("Part D - Recommended follow-ups (not changed in this pass)")
body("These need product decisions or testing and were intentionally left for review:")
bullet("Rate limiting on public/abuse-prone routes (request-access, public/inquiry, transcribe, "
       "compare-report). The app has none today; add Upstash or similar.")
bullet("Agent (Gmail) 'act_directly' autonomy enforces the 'confirm before irreversible' rule only "
       "in the system prompt - a malicious email could override it. Add a code-level confirmation "
       "gate and validate/allow-list recipients before send.")
bullet("CLIPFLOW_TOKEN_SECRET falls back to the service-role key for encrypting OAuth tokens. "
       "Require a dedicated secret (no rows are encrypted yet, so it is safe to switch now).")
bullet("Timeline clipPath signing (/api/editor/timeline/[id]) and signed-upload routes should "
       "verify the referenced path/project belongs to the caller (defense in depth; today they are "
       "protected only by the user-id storage namespace).")
bullet("Stop returning raw upstream/exec error strings to clients (info disclosure); log "
       "server-side and return generic messages.")
bullet("Neutralize CSV formula injection in the analysis export (prefix cells starting with = + - @).")
bullet("Enable Supabase leaked-password protection; set ADMIN_ACTION_SECRET in all environments "
       "(the app now refuses to mint admin links without it).")

pdf.ln(3)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(*GRAY)
pdf.multi_cell(pdf.epw, 5, clean(
    "Files changed: supabase/{schema,brand,gigs,bookings,agent,clipflow,security_hardening}.sql, "
    "lib/security/ssrf.ts (new), lib/clipflow/{clipper,youtube}.ts, lib/{adminToken,email}.ts, "
    "lib/gigs/ics.ts, lib/brand/extract.ts, app/api/compare-report/route.ts, "
    "app/api/clipflow/jobs/run/route.ts, app/api/transcribe/route.ts, "
    "app/api/editor/[id]/upload/route.ts, package-lock.json. Verified: tsc --noEmit passes."
))

out = "/home/user/speech-analyzer2/Orator-Security-Report.pdf"
pdf.output(out)
print("wrote", out)
