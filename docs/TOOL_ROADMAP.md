# Speaker Hub — Tool Roadmap (research-backed)

Deep-research synthesis of the highest-value tools to add next, benchmarked against
real competitor products and speaker-business sources. Build sizing (S/M/L) assumes the
current **Next.js 14 + Supabase + Vercel** stack.

**Already shipped (not re-recommended):** speech-engagement analyzer, BYOK AI assistant,
Booking Inbox, Script Studio, video/timeline editor, talk compare, talk library,
per-speaker branding, gigs calendar (manual + iCal), public one-sheet w/ inquiry capture,
delete-chat.

**The differentiation thesis.** The hub already owns three things point-tools don't have
together: the *talk content* (analyzer / transcript / editor), the *brand + public
one-sheet*, and the *booking pipeline*. The defensible plays are the ones that **connect**
them into a loop: `live audience → owned email list → booking inbox → proposal + deposit →
analytics`, and `talk content → repurposed marketing → discovery → more inbound`. Incumbents
(Slido, Opus Clip, HoneyBook, eSpeakers) each own one slice; the hub's moat is the closed loop.

---

## Quick wins — small build, high leverage, mostly reuse data we already store

### 1. Social Proof Engine  ·  **S–M**
Post-gig automation that requests text/video testimonials (and audience-reaction clips) at
the moment of peak goodwill, organizes them tagged by industry/event-type, and auto-publishes
approved ones to the one-sheet.
- **Pain:** Speakers miss the 72-hour post-event window when testimonials/referrals convert
  best, then have nothing fresh to show planners (who decide largely on proof).
- **Evidence:** [SpeakerFlow — 72-hr window is "the highest-conversion moment"](https://speakerflow.com/7-steps-to-get-booked-as-a-conference-keynote-speaker/); [CoveTalks — "nothing sells a speaker faster than footage of an audience responding"](https://covetalks.com/articles/testimonial-system-collecting-leveraging-proof-booking-speaking); [The Speaker Lab — testimonials from *similar* orgs cut perceived risk](https://thespeakerlab.com/blog/speaker-testimonials/).
- **Benchmark:** Senja / VideoAsk / Vouch collect & embed video testimonials — but none are
  speaker-aware or linked to a gig. Talkadot is the closest speaker-native analog.
- **Ties-in:** Fires from the **Booking Inbox** when a gig hits "completed"; testimonials FK to
  the gig (inherit client/topic/date) and flow onto the **one-sheet**, industry-filterable via a
  `?industry=` param a bureau can append.
- **Monetization/diff:** A living, filtered "wall of love" on the one-sheet is a parity-beating
  feature no speaker CRM ships natively.

### 2. Audience Capture & Email List  ·  **S–M**
A per-talk QR / short code → friction-free opt-in: "text-to-join," "scan-to-get-slides"
(lead-magnet gated), and a newsletter capture block on the one-sheet. Captured contacts land
in the hub's audience store.
- **Pain:** Speakers stand in front of hundreds of warm prospects and leave with **zero**
  contacts; the email list is the asset they most lack.
- **Evidence:** [SpeakerHub — newsletters are "the most direct, trusted, effective channel," CTA-at-end-of-keynote is prime capture](https://speakerhub.com/skillcamp/6-step-guide-email-marketing-professional-speakers); [The Speaker Lab — a bare newsletter box "is not enough," gate behind an incentive](https://thespeakerlab.com/blog/how-to-build-an-email-list/); [AudienceTap — SMS QR opt-in "the lowest-friction list-building method"](https://www.audiencetap.com/use-cases/qr-code-events-trade-shows).
- **Benchmark:** This is a deliberate **gap** in Slido/Mentimeter (they capture participation,
  not contacts). Leadpages/Kit own lead-magnets but aren't speaker-native.
- **Ties-in:** Same store as the **Booking Inbox**; the opt-in landing pages reuse one-sheet
  branding; QR can be an outro card on exported clips.
- **Monetization/diff:** Turning the room into an owned audience is the single biggest thing
  the polling incumbents refuse to do.

### 3. Speaking-Business Analytics + Lead-Source Attribution  ·  **S**
A dashboard over existing gig + inbox data: trailing-12-month revenue, average fee/gig,
weighted pipeline value, win rate, fee trend, "career reach" (audiences addressed), and win
rate **by lead source** (referral / one-sheet / bureau / repeat).
- **Pain:** Speakers don't know their own numbers, so they under-price and can't see which
  channels actually book.
- **Evidence:** [SpeakerFlow — tracked example "$73k/12mo, $5,615 avg/event" is what speakers should measure](https://speakerflow.com/how-much-do-speaking-engagements-pay/); [Sessionboard — dashboards reveal "which sources… bring the most value"](https://www.sessionboard.com/blog/new-speaker-crm-dashboards-unlock-insights-drive-activation-and-prove-value).
- **Benchmark:** SpeakerFlow & Sessionboard treat pipeline/value analytics as table stakes; we
  get it almost free from data already stored.
- **Ties-in:** Pure read-model over **gigs** (fee/date/status) + **Booking Inbox** (stage/source);
  auto-attributes "one-sheet" leads since we own that form. Makes disciplined data entry pay off.

### 4. Per-Talk SEO Pages + Schema  ·  **M**
Auto-generate individually indexable landing pages per talk/topic with `Person`/`Event`
JSON-LD, sitemap, and meta — so the speaker owns page one for their name and niche.
- **Pain:** Buyers Google a speaker by name or niche; a single one-sheet URL gives search
  engines nothing to rank, so bureaus/competitors win the SERP.
- **Evidence:** [SpeakerHub — buyers "search Google to find a speaker," own your name's first page](https://speakerhub.com/skillcamp/seo-basics-speakers-how-get-people-find-you-google); [Sessionboard — speaker/session content is a core SEO asset](https://www.sessionboard.com/blog/why-is-speaker-content-the-key-to-seo).
- **Benchmark:** A clear wedge — no Speaker-Hub competitor ships per-talk schema'd pages OOTB;
  Next.js (SSG/ISR + `generateMetadata` + JSON-LD) is ideal for it.
- **Ties-in:** Turns each **talk library** entry into an indexable page funneling to the one-sheet
  booking form.

### 5. Sizzle-Reel Hero + Per-Talk Video Gallery  ·  **S**
Make a 60–120s demo reel the above-the-fold hero of the one-sheet, with a short clip per talk.
- **Pain:** Organizers decide in the first ~15s of a reel and won't read a bio first; the
  current one-sheet leads with text.
- **Evidence:** [Speaking For A Living — "most bookings start with someone watching a reel… decide in the first 15 seconds"](https://www.speakingforaliving.com/how-to-create-a-speaker-reel/); [share.one — booking decisions often made in the first 30–60s of the reel](https://www.share.one/how-video-testimonials-can-elevate-your-speaker-reel-and-supercharge-your-speaking-career/).
- **Ties-in:** One field on the existing one-sheet + a clip URL per talk-library entry; clips can
  be the ones produced by the repurposing engine (#10).

### 6. Transcript → Content Pack (social posts + show-notes/blog)  ·  **S–M**
From one talk transcript: 3–5 LinkedIn posts, an X thread, IG captions, pull-quotes, plus a
1,500–2,000-word SEO blog post with timestamped chapters — all editable, in the speaker's voice.
- **Pain:** A great talk never reaches the feed because turning it into *text* is a separate
  chore speakers skip.
- **Evidence:** [Castmagic — one upload → "show notes, summaries, newsletters, social posts… quote pulls"](https://www.castmagic.io/); [Riverside — transcript → "titles, SEO keywords, chapters with timestamps, key takeaways," repurposed to blog/newsletter/social](https://riverside.com/show-notes).
- **Benchmark:** Castmagic/Riverside/Podsqueeze own this; it's pure LLM-over-transcript — and we
  already have the transcripts.
- **Ties-in:** Reuses the **analyzer transcript** + one-sheet **brand voice**; pull-quotes deep-link
  to the matching **editor** timestamp; blog chapters map to editor segments.

### 7. Products-Beyond-the-Stage Storefront  ·  **S–M**
A lightweight catalog where a speaker merchandises non-stage offers (course, cohort, coaching,
book, paid newsletter, workshop) via Stripe Payment Links / outbound URLs, shown on the
one-sheet and insertable into inbox replies.
- **Pain:** Keynote income is *linear* — "speakers only get paid each time they speak"; advisors
  push 5+ streams but speakers have no place to merchandise them.
- **Evidence:** [SpeakerHub — "multiple streams… no longer a luxury, it's a necessity"](https://speakerhub.com/skillcamp/how-develop-multiple-revenue-streams-speaker); [Kajabi — diversify via courses, webinars, 1:1 coaching in one place](https://www.kajabi.com/product).
- **Benchmark:** Don't *be* Kajabi — be the **storefront/aggregator** that links to it. Stripe
  Payment Links keep it PCI-free and S.
- **Ties-in:** Appears on the **one-sheet**; one-click insert into **Booking Inbox** replies ("date
  doesn't fit? here's my workshop/course") converts lost/low-fee leads into product revenue.

---

## Bigger bets — new infra/integrations, but strong moats & revenue

### 8. Proposal → e-Sign → Deposit, one link  ·  **L** (pivotal)
A single branded link where a prospect reviews the offer, e-signs, and pays the deposit —
plus a speaker payment schedule (deposit now + balance N days before event) and "viewed/
signed/stalled" tracking.
- **Pain:** Deals die in the gap between "interested" and "confirmed." The Booking Inbox stops
  at a status flag; the speaker still assembles quote + contract + payment across 3 tools.
- **Evidence:** [Qwilr — "pitch, sign and take deposits in one branded link… deposit clears at signature"](https://qwilr.com/industry/proposal-software-for-events/); [speakers.com — "50% deposit… industry standard to confirm a date… balance ~30 days before the event"](https://speakers.com/keynote-speaker-fee-schedule-2026-the-definitive-pricing-guide-for-event-planners/).
- **Benchmark:** HoneyBook "Smart Files" + Qwilr + PandaDoc bundle proposal+contract+invoice on
  one page; no speaker-native tool ties it to a talk-aware one-sheet.
- **Ties-in:** The action on a "discussing" inquiry; auto-populates from the **one-sheet**
  (bio/topics/testimonials); on signature+deposit auto-flips to "confirmed" and creates the **gig**.
- **Monetization/diff:** The biggest revenue unlock — turns the inbox from a tracker into a
  money-movement tool. (Payments = obvious take-rate or premium-tier hook.)

### 9. Pipeline Automation & Speed-to-Lead  ·  **M**
Instant auto-acknowledgement on new inquiries, day-3/day-7 nudges, templated follow-up
sequences keyed to stage (no reply / proposal unsigned / deposit unpaid), and stale-client
re-engagement.
- **Pain:** Inbound leads die from slow/forgotten follow-up; an inquiry sitting ~3 days means
  "the prospect booked someone else." The current inbox is passive.
- **Evidence:** [Capsule — inquiries unanswered ~3 days lose the booking; structured day-3/day-7 follow-up](https://capsulecrm.com/blog/crm-for-event-planners/); [SpeakerFlow CRM — "let task automation handle that… nothing slips through the cracks"](https://speakerflow.com/system/crm/).
- **Benchmark:** Every speaker CRM (SpeakerFlow, karmaSpeaker) centers follow-up automation; it's
  absent from a bare inbox.
- **Ties-in:** Upgrades the **Booking Inbox** to an active pipeline; sequences key off the same
  statuses + the view/sign/deposit events from #8; the AI **assistant** can draft the messages.

### 10. Live Event Mode (Q&A · polls/word-cloud · quiz · NPS)  ·  **M–L**
One QR/short code per scheduled talk hosting audience Q&A (anonymous + upvote + moderation),
live polls & word clouds, an optional quiz, and an auto-triggered post-talk NPS/feedback survey
— with a speaker "stage view."
- **Pain:** Talks are one-directional; speakers can't read the room, run a "wow" interactive
  moment, surface the best questions, or prove "I scored 9.2 NPS" to win the next booking.
- **Evidence:** [Mentimeter — anonymous submission "encourages participation from attendees hesitant to speak"](https://www.mentimeter.com/features/live-questions-and-answers); [Pigeonhole — upvoting "surfaces the most relevant questions… ensures the session addresses what matters"](https://pigeonholelive.com/features/live-questions-and-answers/); [SurveyMonkey — survey "as soon as the event ends" for best response](https://www.surveymonkey.com/mp/post-event-survey-questions/).
- **Benchmark:** Slido/Mentimeter/Vevox/Pigeonhole are the incumbents — but they stop at
  participation + spreadsheet export. **Differentiation:** pipe engaged attendees into Audience
  Capture (#2), and turn NPS into a credential shown in the **Booking Inbox** / one-sheet.
- **Build note:** Q&A/polls/quiz/stage-sync need **Supabase Realtime**; NPS + capture are plain
  request/response (ship those first).
- **Ties-in:** Becomes the join key linking a **live** talk to its **recorded** analyzer entry, its
  captured leads, and its NPS — one record per keynote.

### 11. AI Clip Finder + Vertical Reframe + Captions  ·  **M–L**
Auto-scan a talk's transcript+video for the 10–25 most "clippable" moments (ranked 0–100),
pre-trim them into the editor, auto-reframe to 9:16/1:1 with face-tracking, and burn word-synced
captions.
- **Pain:** Speakers have a 45-min recording but no idea which 60–90s moments to post; manual
  scrubbing + reframing + captioning is the friction that stops all social posting.
- **Evidence:** [Opus Clip — "10–25 clips… auto-reframed for vertical… tagged with a Virality Score"](https://www.opus.pro/blog/best-video-repurposing-tools); [OpusClip review — clip "gets a score from 0 to 100," face-tracking keeps framing centered](https://skywork.ai/blog/opusclip-review-2025-ai-auto-clipping-virality-score-scheduler/).
- **Benchmark:** Opus Clip / Descript / Vidyo.ai — now table-stakes for repurposing.
- **Build note:** Clip *selection* is LLM-over-transcript (S/M); **auto-reframe is the L** (FFmpeg +
  tracking, or buy via API). Captions are easy — we already have word-level timing.
- **Ties-in:** Feeds the existing **clip/export** pipeline; clips populate the reel gallery (#5) and
  the content pack (#6).

### 12. Built-in Social Scheduler / Content Calendar  ·  **L**
Queue and auto-publish clips, posts, and quote-cards to LinkedIn/X/IG/TikTok/YouTube on a
visual calendar from inside the hub.
- **Pain:** After generating assets, speakers bounce to Buffer/Hypefury and lose consistency —
  the thing that actually grows an audience.
- **Evidence:** [Buffer — visual calendar + queue across 11 networks](https://buffer.com/publish); [Opus added native scheduling so users "don't leave the tool"](https://skywork.ai/blog/opusclip-review-2025-ai-auto-clipping-virality-score-scheduler/).
- **Build note:** The **L** is multi-platform OAuth + posting APIs + token refresh; phase it
  (LinkedIn + X first). Calendar UI is M.
- **Ties-in:** The "publish" terminus for #6, #10's clips, and #11 — closes editor → assets →
  distribution.

### 13. Post-Confirm Logistics / Run-of-Show Intake  ·  **M**
After "confirmed," send the client a smart questionnaire for AV/tech, room setup, run-of-show
timing, travel/accommodation, and W-9/payment details.
- **Pain:** Closed deals devolve into email chasing for AV + travel + tax paperwork; missing
  details cause on-site failures.
- **Evidence:** [Jotform Speakers Inquiry Form — gather event/format/venue/AV/budget "in one place, reducing back-and-forth"](https://www.jotform.com/form-templates/speakers-inquiry-form); [LegalGPS — speaker contracts specify travel, accommodation, transport, meals + tax docs](https://www.legalgps.com/templates/profession/public-speakers).
- **Ties-in:** Triggered when an inquiry becomes a **gig**; populates the gig's logistics so the
  speaker walks in prepared. Natural successor to the proposal flow (#8).

### 14. Directory Syndication Kit + Embeddable Booking Widget  ·  **M**
One-click export of the one-sheet into the formats directories/bureaus need (eSpeakers,
SpeakerHub, AAE), plus an embeddable "Book Me" widget for the speaker's own site.
- **Pain:** Speakers re-type the same bio/topics/fee/headshot into every directory, and their
  listings drift out of sync.
- **Evidence:** [eSpeakers — "Book Me Now" widget + "seamless website integration"](https://www.espeakers.com/speakers/); [eSpeakers — one profile published to many bureau/association directories](https://www.espeakers.com/publish-directory/).
- **Ties-in:** Reuses the **one-sheet** content; the embedded widget routes submissions into the
  **Booking Inbox** ("one source, many surfaces").

---

## Recommended Top 5 to build next

Chosen for **leverage on data we already store × build cost × differentiation × revenue impact**:

1. **Social Proof Engine (#1, S–M)** — highest ROI for the cost; planners book on proof; reuses
   one-sheet + gigs; ships a living "wall of love" no competitor has natively.
2. **Audience Capture & Email List (#2, S–M)** — converts the live room into an owned asset that
   feeds the inbox; this is the exact thing Slido/Menti refuse to do (clear wedge).
3. **Speaking-Business Analytics + lead-source attribution (#3, S)** — nearly free from existing
   gig/inbox data, makes the pipeline "worth filling in," and matches competitor table-stakes.
4. **Transcript → Content Pack (#6, S–M)** — turns assets we already own (transcripts) into a
   marketing flywheel; low cost, high visible value, strengthens discovery (#4/#5).
5. **Proposal → sign → deposit (#8, L)** — the marquee bigger-bet: the biggest revenue unlock and
   the strongest moat, turning the Booking Inbox into a money-movement tool. Start scoping in
   parallel since it's the long pole.

**Sequencing logic:** ship #1–#4 fast (they're S/M, reuse data, and visibly improve the product
within weeks), begin #8 in parallel (it's the L with the highest payoff), then layer Live Event
Mode (#10) and the repurposing/scheduler stack (#11–#12) as the "audience + content" flywheel.

---

### Source caveat
Several vendor product pages (karmaSpeaker, Bookd, SpeakerFlow, Castmagic, Senja, Mentimeter
deep pages) returned HTTP 403 to automated fetches, so a few **specific figures** (e.g. the
$73k/$5,615 fee example, "decide in 15 seconds," Senja's $19/mo, ">40%" lead-magnet conversion)
come from search-result summaries and secondary sources rather than first-party reads — treat
exact numbers as **directional** and re-verify before quoting publicly. The qualitative drivers
(50% deposit / balance-before-event norms, 72-hour testimonial window, referrals as the #1
booking source, reel-first decisions, income linearity, speed-to-lead) are each corroborated
across multiple independent sources and are high-confidence.
