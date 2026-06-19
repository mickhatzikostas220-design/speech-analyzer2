#!/usr/bin/env python3
"""Generate the change report PDF for the Orator maintenance pass."""
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

OUT = "Orator-Maintenance-Report-2026-06-19.pdf"

PURPLE = colors.HexColor("#7c3aed")
DARK = colors.HexColor("#18181b")
GREY = colors.HexColor("#52525b")
LIGHT = colors.HexColor("#f4f4f5")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("TitleBig", parent=styles["Title"], fontSize=24,
                          textColor=DARK, spaceAfter=4, leading=28))
styles.add(ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10.5,
                          textColor=GREY, spaceAfter=2))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14,
                          textColor=PURPLE, spaceBefore=16, spaceAfter=6))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10.5,
                          textColor=DARK, leading=15, spaceAfter=6))
styles.add(ParagraphStyle("Cell", parent=styles["Normal"], fontSize=9.5,
                          textColor=DARK, leading=13))
styles.add(ParagraphStyle("CellHead", parent=styles["Normal"], fontSize=9.5,
                          textColor=colors.white, leading=13, fontName="Helvetica-Bold"))

story = []

story.append(Paragraph("Orator — Website Maintenance Report", styles["TitleBig"]))
story.append(Paragraph("Automated review and fix pass · 19 June 2026", styles["Sub"]))
story.append(Paragraph("Branch: <b>claude/relaxed-sagan-9wamfb</b> · Repo: mickhatzikostas220-design/speech-analyzer2", styles["Sub"]))
story.append(Spacer(1, 8))
story.append(HRFlowable(width="100%", thickness=1, color=LIGHT))
story.append(Spacer(1, 8))

story.append(Paragraph("Summary", styles["H2"]))
story.append(Paragraph(
    "I reviewed the Orator Next.js application end to end, building and linting "
    "the project to surface real problems. The headline finding was a "
    "<b>build-breaking bug</b>: the production build failed outright. I fixed "
    "that and a cluster of related correctness, security, and quality issues. "
    "After the changes, both <b>npm run build</b> and <b>npm run lint</b> "
    "complete cleanly. All work is committed and pushed to the feature branch.",
    styles["Body"]))

# Severity table
story.append(Paragraph("Changes at a glance", styles["H2"]))
data = [
    [Paragraph("Severity", styles["CellHead"]),
     Paragraph("Area", styles["CellHead"]),
     Paragraph("Change", styles["CellHead"])],
]
rows = [
    ("Critical", "Build", "Lazy-init OpenAI client so the production build no longer crashes when secrets are absent at build time."),
    ("High", "Rendering", "Marked auth-gated (app) and (auth) layouts force-dynamic so per-user pages are never statically cached."),
    ("High", "Security", "Closed an auth gap: /compare was reachable without a session; now protected in middleware."),
    ("Medium", "Security", "Documented the undocumented ADMIN_ACTION_SECRET and switched admin-token verification to a timing-safe compare."),
    ("Medium", "Tooling", "Added ESLint config + typescript-eslint so lint runs non-interactively; fixed every surfaced error."),
    ("Low", "Branding", "Unified stray 'ACA' references (navbar logo, chat prompt) to 'Orator'."),
]
sev_color = {"Critical": "#dc2626", "High": "#ea580c",
             "Medium": "#ca8a04", "Low": "#16a34a"}
for sev, area, desc in rows:
    data.append([
        Paragraph(f'<font color="{sev_color[sev]}"><b>{sev}</b></font>', styles["Cell"]),
        Paragraph(area, styles["Cell"]),
        Paragraph(desc, styles["Cell"]),
    ])

t = Table(data, colWidths=[0.85*inch, 0.95*inch, 4.45*inch])
t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), PURPLE),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#e4e4e7")),
]))
story.append(t)

# Detailed sections
def section(title, paras):
    story.append(Paragraph(title, styles["H2"]))
    for p in paras:
        story.append(Paragraph(p, styles["Body"]))

section("1. Build failure — module-level OpenAI client (Critical)", [
    "<b>Files:</b> lib/openai.ts, app/api/compare-report/route.ts",
    "The OpenAI client was constructed at module load time "
    "(<i>const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })</i>). "
    "During Next.js page-data collection the module is evaluated, and with the "
    "key absent the constructor throws, aborting the entire build with "
    "“The OPENAI_API_KEY environment variable is missing or empty”.",
    "<b>Fix:</b> the client is now created lazily on first use inside the request "
    "path, and the compare-report route is marked <i>force-dynamic</i>. Secrets "
    "are a runtime concern, not a build-time one.",
])

section("2. Static prerendering of authenticated pages (High)", [
    "<b>Files:</b> app/(app)/layout.tsx, app/(auth)/layout.tsx",
    "The shared Navbar instantiates the Supabase browser client during render, "
    "and the server pages read per-user session data. Next.js was attempting to "
    "statically prerender these routes at build time, which both failed without "
    "env vars and risks serving cached, user-specific pages in production.",
    "<b>Fix:</b> both layouts now export <i>const dynamic = 'force-dynamic'</i>, "
    "forcing on-demand server rendering for every dashboard, history, compare, "
    "editor, and auth page.",
])

section("3. Unprotected /compare route (High, security)", [
    "<b>File:</b> middleware.ts",
    "The auth middleware redirected unauthenticated visitors away from "
    "/dashboard, /analysis, /history, /admin and /editor — but /compare "
    "was omitted from the protected list despite being linked in the navbar and "
    "loading user analyses. An unauthenticated user could reach it directly.",
    "<b>Fix:</b> added <i>path.startsWith('/compare')</i> to the protected-path "
    "check so it redirects to /login like the other app routes.",
])

section("4. Admin action secret & token verification (Medium, security)", [
    "<b>Files:</b> .env.local.example, lib/adminToken.ts",
    "ADMIN_ACTION_SECRET signs the one-time approve/deny links emailed to admins, "
    "but it was never documented and falls back to a hardcoded "
    "'fallback-secret-change-me' if unset — meaning anyone could forge valid "
    "action links against a default deployment. It is now documented in the env "
    "example with an explicit warning.",
    "Token verification also compared HMAC signatures with a plain <i>!==</i>, "
    "which leaks timing information. It now uses a length check plus "
    "<i>crypto.timingSafeEqual</i>.",
])

section("5. Lint setup and code-quality fixes (Medium)", [
    "<b>Files:</b> .eslintrc.json (new), package.json, and several pages/components",
    "The project had no ESLint configuration, so <i>npm run lint</i> dropped into "
    "an interactive prompt and could not run in CI. I added a config extending "
    "next/core-web-vitals and @typescript-eslint/recommended (installing the "
    "plugin/parser), with no-unused-vars honoring the underscore convention.",
    "I then fixed every error it surfaced: unescaped quotes/apostrophes in JSX "
    "(editor, history, signup, request-access, success pages), an unused import "
    "and several unused variables in the compare page, and dead code "
    "(getVal, METRIC_DESCRIPTIONS, scoreColor). Two remaining items are "
    "<i>&lt;img&gt;</i> warnings on dynamic video frames, intentionally left as-is.",
])

section("6. Branding consistency (Low)", [
    "<b>Files:</b> components/Navbar.tsx, app/api/analyses/[id]/chat/route.ts",
    "Two stray references called the product “ACA” — the navbar logo "
    "and the chat assistant's system prompt — while the rest of the app, "
    "metadata, and README use “Orator”. Both now say “Orator”.",
])

section("Verification", [
    "✓ <b>npm run build</b> — compiles successfully, all 19 pages generate.",
    "✓ <b>npm run lint</b> — no errors (only two pre-existing &lt;img&gt; warnings on dynamic frames).",
    "✓ All changes committed and pushed to <b>claude/relaxed-sagan-9wamfb</b>; a draft PR was opened.",
])

section("Notes for follow-up", [
    "• The @anthropic-ai/sdk dependency is declared but unused in source — a "
    "candidate for removal if not planned for use.",
    "• npm audit reports vulnerabilities in transitive deps; a separate "
    "dependency-bump pass is advisable.",
    "• README “Known limitations” (no rate limiting, placeholder waveform, "
    "approximate Tribe ROI indices) remain open by design.",
])

doc = SimpleDocTemplate(OUT, pagesize=LETTER,
                        leftMargin=0.9*inch, rightMargin=0.9*inch,
                        topMargin=0.8*inch, bottomMargin=0.8*inch,
                        title="Orator Maintenance Report")
doc.build(story)
print("wrote", OUT)
