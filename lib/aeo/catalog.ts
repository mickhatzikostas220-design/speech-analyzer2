import type { AeoTipContent } from './types';

// The AEO (Answer Engine Optimization) playbook for speakers. Each tip is a
// concrete change that makes a speaker easier for AI answer engines (ChatGPT,
// Perplexity, Google AI Overviews, Gemini) to understand, trust, and recommend.
//
// Tips are released to users in this order. Keep keys stable — they're stored in
// aeo_tips.tip_key. Add new tips at the end so existing users pick them up next.
export const AEO_CATALOG: AeoTipContent[] = [
  {
    key: 'entity-one-liner',
    title: 'Lead with a one-sentence "who you are"',
    summary: 'Put a single, plain-language sentence describing who you are and what you speak about above the fold.',
    why: 'Answer engines extract a short definition of you ("X is a keynote speaker on Y"). If your homepage states it in one clean sentence, that sentence becomes the answer. If it doesn\'t, the model guesses — or skips you.',
    effort: 'quick',
    tracks: {
      wix: [
        { title: 'Open the page editor', detail: 'In your Wix dashboard, click Edit Site and go to your homepage.' },
        { title: 'Add a heading near the top', detail: 'Add or edit a Text element above the fold. Use a real Heading (H1 or H2), not styled body text.' },
        { title: 'Write the sentence', detail: 'Format: "[Your name] is a [role] who helps [audience] [outcome]." e.g. "Mick Hatzikostas is a keynote speaker who helps sales teams sell with story."' },
        { title: 'Publish', detail: 'Click Publish. Reload the live page to confirm the sentence is real text (not inside an image).' },
      ],
      other: [
        { title: 'Edit your homepage', detail: 'Open your site builder (Squarespace, Webflow, WordPress, etc.) and edit the homepage hero.' },
        { title: 'Use a heading block', detail: 'Place the sentence in a Heading block so it carries semantic weight — avoid burning it into a background image.' },
        { title: 'Write the sentence', detail: '"[Your name] is a [role] who helps [audience] [outcome]." Keep it under 20 words and free of jargon.' },
        { title: 'Save & preview', detail: 'Publish and view the live page to confirm the text is selectable, not an image.' },
      ],
      code: [
        { title: 'Add a semantic H1', detail: 'In your hero component, render the sentence inside an <h1> (or <h2> if H1 is your name/logo).' },
        { title: 'Example', detail: '<h1>Mick Hatzikostas is a keynote speaker who helps sales teams sell with story.</h1>' },
        { title: 'Mirror it in metadata', detail: 'Set the same idea in your <title> and <meta name="description">. In Next.js, export `metadata` with a matching `description`.' },
        { title: 'Ship & verify', detail: 'Deploy, then run "view source" — the sentence should appear in the raw HTML, not only after JS hydration.' },
      ],
    },
  },
  {
    key: 'person-schema',
    title: 'Add Person structured data (JSON-LD)',
    summary: 'Mark up your name, role, and links with schema.org Person JSON-LD so engines read you as a known entity.',
    why: 'Structured data is the most machine-readable way to say "this is a person, here is their job title, here is their official website and social profiles." It strengthens your entity and helps engines disambiguate you from people with the same name.',
    effort: 'medium',
    tracks: {
      wix: [
        { title: 'Open Custom Code', detail: 'Wix dashboard → Settings → Custom Code → + Add Custom Code.' },
        { title: 'Paste the JSON-LD', detail: 'Add a <script type="application/ld+json"> block with your Person schema (name, jobTitle, url, sameAs links to your socials).' },
        { title: 'Scope it', detail: 'Set it to load on "All pages" (or just the homepage) in the <head>.' },
        { title: 'Validate', detail: 'Publish, then paste your URL into Google\'s Rich Results Test to confirm the Person is detected.' },
      ],
      other: [
        { title: 'Find the head/embed option', detail: 'Squarespace: Settings → Advanced → Code Injection. WordPress: a header-scripts plugin or theme settings.' },
        { title: 'Add the JSON-LD', detail: 'Insert a <script type="application/ld+json"> Person object with name, jobTitle, url, image, and sameAs (array of your profile URLs).' },
        { title: 'Save sitewide', detail: 'Place it in the site header so it loads on every page.' },
        { title: 'Validate', detail: 'Run the live URL through Google\'s Rich Results Test / Schema Markup Validator.' },
      ],
      code: [
        { title: 'Render a JSON-LD script tag', detail: 'In your root layout, add <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />.' },
        { title: 'Build the object', detail: '{ "@context":"https://schema.org", "@type":"Person", "name":"…", "jobTitle":"Keynote Speaker", "url":"https://…", "sameAs":["https://linkedin.com/in/…","https://youtube.com/@…"] }' },
        { title: 'Keep sameAs accurate', detail: 'Only list profiles you control. Mismatched links weaken rather than strengthen the entity.' },
        { title: 'Validate', detail: 'Deploy and test with the Schema Markup Validator; fix any warnings.' },
      ],
    },
  },
  {
    key: 'faq-block',
    title: 'Answer the exact questions people ask',
    summary: 'Add an FAQ section using the literal questions people (and AI) ask about booking and topics.',
    why: 'Answer engines love verbatim question→answer pairs — they can lift them directly. "How do I book [you]?", "What does [you] speak about?", "What is [your] fee range?" become answerable instantly.',
    effort: 'medium',
    tracks: {
      wix: [
        { title: 'Add an FAQ section', detail: 'Use the Wix FAQ element (Add → Content → FAQ) or a stack of accordion text blocks.' },
        { title: 'Write real questions', detail: 'Use natural phrasing: "What topics does [name] speak on?", "How do I book [name] for an event?", "Where is [name] based?"' },
        { title: 'Answer concisely', detail: 'First sentence of each answer should fully answer the question on its own — engines often quote just that line.' },
        { title: 'Add FAQ schema (optional)', detail: 'Via Custom Code, add FAQPage JSON-LD mirroring the visible Q&A for extra clarity.' },
      ],
      other: [
        { title: 'Add an FAQ/accordion block', detail: 'Most builders ship an FAQ or accordion component — add one to your homepage or speaking page.' },
        { title: 'Phrase as real questions', detail: 'Match how people actually ask. Include your name in the questions where natural.' },
        { title: 'Lead with the answer', detail: 'Put the complete answer in the first sentence; details after.' },
        { title: 'Mirror in FAQPage schema', detail: 'If your builder allows head code, add FAQPage JSON-LD that matches the visible questions and answers.' },
      ],
      code: [
        { title: 'Render visible Q&A', detail: 'Use a <section> with <h3> questions and <p> answers (or <details>/<summary> accordions). Keep it real HTML text.' },
        { title: 'Add FAQPage JSON-LD', detail: 'Emit FAQPage structured data whose mainEntity questions/answers exactly match the visible text.' },
        { title: 'Keep them in sync', detail: 'Drive both the markup and the JSON-LD from one data array so they never drift apart.' },
        { title: 'Validate', detail: 'Test the page in the Rich Results Test and confirm FAQ is detected.' },
      ],
    },
  },
  {
    key: 'topics-page',
    title: 'Give each signature talk its own page',
    summary: 'Create a dedicated, well-titled page per talk topic with a clear description and takeaways.',
    why: 'When someone asks an engine "who speaks about [topic]?", it matches against pages that are unambiguously about that topic. One page per talk — with the topic in the heading — makes you the obvious answer for that query.',
    effort: 'project',
    tracks: {
      wix: [
        { title: 'Add a page per talk', detail: 'Wix → Pages & Menu → + Add Page. Name it after the talk topic.' },
        { title: 'Set a descriptive H1', detail: 'Heading should name the topic and outcome, e.g. "Storytelling for Sales Teams — Keynote".' },
        { title: 'Describe the talk', detail: 'Add 2–3 short paragraphs: who it\'s for, the 3 takeaways, and the format/length.' },
        { title: 'Set the SEO basics', detail: 'In page SEO settings, write a title tag and meta description that include the topic and your name. Publish.' },
      ],
      other: [
        { title: 'Create a topic page', detail: 'Add a new page per signature talk in your builder; give it a clean URL slug like /keynotes/storytelling-for-sales.' },
        { title: 'Topic-first heading', detail: 'Make the H1 the topic + format, not a clever title only you understand.' },
        { title: 'Structure the body', detail: 'Use subheadings: "Who it\'s for", "What they\'ll leave with", "Formats". Bulleted takeaways scan well for engines.' },
        { title: 'Per-page metadata', detail: 'Set the page title and meta description to include the topic and your name.' },
      ],
      code: [
        { title: 'Add a route per talk', detail: 'Create /talks/[slug] pages (or static routes) driven by a talks data file.' },
        { title: 'Semantic structure', detail: 'H1 = topic + format; H2s for audience, takeaways, formats; use a <ul> for the 3 takeaways.' },
        { title: 'Per-page metadata', detail: 'In Next.js, export `generateMetadata` so each talk page has its own title/description.' },
        { title: 'Link them up', detail: 'Link all talk pages from a /speaking index and from your homepage so engines can discover them.' },
      ],
    },
  },
  {
    key: 'allow-ai-crawlers',
    title: 'Let AI crawlers read your site',
    summary: 'Check robots.txt isn\'t blocking AI bots, and add an llms.txt that points engines to your key pages.',
    why: 'If GPTBot, PerplexityBot, Google-Extended, or ClaudeBot are blocked, you simply can\'t be cited. An llms.txt file is a plain-text map that tells AI engines which pages matter most about you.',
    effort: 'quick',
    tracks: {
      wix: [
        { title: 'Review robots.txt', detail: 'Wix → SEO Tools → Robots.txt Editor. Make sure there are no Disallow rules aimed at AI user-agents (GPTBot, PerplexityBot, ClaudeBot, Google-Extended).' },
        { title: 'Keep key pages crawlable', detail: 'Ensure your homepage, speaking, and contact pages are not set to "hidden from search engines".' },
        { title: 'Add llms.txt', detail: 'Wix doesn\'t expose a custom /llms.txt easily — instead, keep a concise, well-linked homepage so crawlers find everything within one click.' },
        { title: 'Confirm', detail: 'Visit yoursite.com/robots.txt in a browser to read exactly what bots see.' },
      ],
      other: [
        { title: 'Open robots settings', detail: 'Find robots.txt (Squarespace auto-generates it; WordPress via Yoast/RankMath). Confirm no blanket Disallow for AI bots.' },
        { title: 'Add llms.txt', detail: 'Upload a /llms.txt at your domain root: a short markdown file listing your name, one-liner, and links to your top pages.' },
        { title: 'Example llms.txt', detail: '"# Mick Hatzikostas\\n> Keynote speaker on storytelling for sales.\\n## Key pages\\n- Speaking: /speaking\\n- Book: /contact"' },
        { title: 'Confirm', detail: 'Load /robots.txt and /llms.txt in your browser to verify they\'re live.' },
      ],
      code: [
        { title: 'Audit robots.txt', detail: 'Ensure your robots.txt (or Next.js app/robots.ts) does not Disallow GPTBot, PerplexityBot, ClaudeBot, or Google-Extended.' },
        { title: 'Add /llms.txt', detail: 'Serve a static public/llms.txt (or an app/llms.txt/route.ts) with your one-liner and links to your most important pages.' },
        { title: 'Keep it short', detail: 'llms.txt is a curated index, not a sitemap dump — list the 5–10 pages that define you.' },
        { title: 'Confirm', detail: 'Deploy and curl https://yoursite.com/llms.txt to verify the response.' },
      ],
    },
  },
  {
    key: 'consistent-entity',
    title: 'Make your name + title identical everywhere',
    summary: 'Use the exact same name, title, and topics across LinkedIn, YouTube, speaker directories, and your site.',
    why: 'Engines build confidence in an entity by seeing consistent signals across the web. "Mick Hatzikostas, keynote speaker on storytelling" repeated identically across profiles is far stronger than five slightly different versions.',
    effort: 'medium',
    tracks: {
      wix: [
        { title: 'Lock your canonical bio', detail: 'Decide one exact name + one-line title. Put it on your site first (it\'s your source of truth).' },
        { title: 'Update each profile', detail: 'Copy that exact wording into LinkedIn headline, YouTube channel description, Instagram bio, and any speaker directories.' },
        { title: 'Link back to your site', detail: 'Every profile should link to your homepage with the same URL (https, no trailing differences).' },
        { title: 'List them in Person schema', detail: 'Add each profile URL to your Person schema\'s sameAs (see the structured-data tip).' },
      ],
      other: [
        { title: 'Write one canonical line', detail: 'One name, one title, one topic phrase. This is your reference copy.' },
        { title: 'Sync every profile', detail: 'Paste the identical line into LinkedIn, YouTube, X, Instagram, and directory listings.' },
        { title: 'Use one website URL', detail: 'Standardize on a single canonical URL everywhere (pick www or non-www and stick to it).' },
        { title: 'Cross-link', detail: 'Ensure each profile links to your site and your site links back to the profiles.' },
      ],
      code: [
        { title: 'Define a profile constant', detail: 'Store name, title, and the canonical URL in one config module so your site never drifts.' },
        { title: 'Reuse it everywhere', detail: 'Render that constant in your hero, footer, metadata, and Person schema sameAs/url fields.' },
        { title: 'Set a canonical tag', detail: 'Add <link rel="canonical"> (Next.js: metadata.alternates.canonical) so engines pick one URL.' },
        { title: 'Sync external profiles', detail: 'Manually match LinkedIn/YouTube/etc. to the same exact strings.' },
      ],
    },
  },
  {
    key: 'proof-credibility',
    title: 'Show proof: testimonials, logos, credentials',
    summary: 'Add named testimonials, client/event logos, and credentials so engines treat you as authoritative.',
    why: 'Answer engines weigh trust (E-E-A-T). Specific, attributed proof — "keynoted SaaStr", a quote from a named VP, a stat — signals you\'re a real, credible authority worth recommending over an unknown.',
    effort: 'medium',
    tracks: {
      wix: [
        { title: 'Add a testimonials strip', detail: 'Use a Wix testimonial/slider element. Each quote needs a real name, title, and company.' },
        { title: 'Add a "seen at" logo row', detail: 'Add an image strip of events/companies you\'ve spoken for (with permission).' },
        { title: 'State credentials in text', detail: 'Put numbers in plain text: "120+ keynotes", "audiences up to 5,000", awards — text, not just graphics.' },
        { title: 'Add Review schema (optional)', detail: 'Via Custom Code, mark up testimonials with Review/AggregateRating JSON-LD.' },
      ],
      other: [
        { title: 'Add attributed quotes', detail: 'Insert testimonials with name + title + organization — anonymous quotes carry little weight.' },
        { title: 'Show a logo wall', detail: 'Add a row of events/brands you\'ve worked with.' },
        { title: 'Put credentials in text', detail: 'Write your track record as readable sentences and numbers, not only inside images.' },
        { title: 'Mark up reviews', detail: 'If you can add head code, include Review JSON-LD for each testimonial.' },
      ],
      code: [
        { title: 'Render attributed testimonials', detail: 'Use <blockquote> with a <cite> for name/title/company so the attribution is machine-readable.' },
        { title: 'Add Review JSON-LD', detail: 'Emit Review (and optionally AggregateRating) structured data matching the visible quotes.' },
        { title: 'Credentials as text', detail: 'Render stats and awards as real text near the top; don\'t hide them in image alt only.' },
        { title: 'Validate', detail: 'Test Review markup in the Rich Results Test.' },
      ],
    },
  },
  {
    key: 'speakable-meta',
    title: 'Tighten titles, descriptions & speakable content',
    summary: 'Write a strong <title> and meta description per page, and keep key facts in short, quotable sentences.',
    why: 'The title and meta description are often what an engine summarizes you by. Short, self-contained sentences (vs. long winding paragraphs) are easier for models to quote accurately in an answer.',
    effort: 'quick',
    tracks: {
      wix: [
        { title: 'Open page SEO settings', detail: 'For each important page: Wix Editor → Page Settings → SEO (Google).' },
        { title: 'Write the title tag', detail: 'Pattern: "[Name] — [Topic] Keynote Speaker". Keep under ~60 characters.' },
        { title: 'Write the meta description', detail: 'One clear sentence (~150 chars) stating who you are and what you speak on.' },
        { title: 'Quotable body sentences', detail: 'Break long paragraphs into short, standalone sentences that each state one fact.' },
      ],
      other: [
        { title: 'Set per-page SEO', detail: 'Use your builder/plugin\'s SEO fields to set a unique title and description per page.' },
        { title: 'Title pattern', detail: '"[Name] — [Topic] Keynote Speaker", under ~60 chars; avoid duplicate titles across pages.' },
        { title: 'Description', detail: 'One factual sentence, ~150 chars, with your name and topic.' },
        { title: 'Quotable copy', detail: 'Favor short sentences that each carry a single fact engines can lift.' },
      ],
      code: [
        { title: 'Export metadata per route', detail: 'In Next.js, set `metadata` (or `generateMetadata`) with a unique title + description on every page.' },
        { title: 'Title & description', detail: 'Title: "[Name] — [Topic] Keynote Speaker". Description: one factual sentence with name + topic.' },
        { title: 'Add speakable (optional)', detail: 'Add SpeakableSpecification to your schema for the sentences you most want read aloud.' },
        { title: 'Quotable copy', detail: 'Write key facts as short standalone sentences rather than dense paragraphs.' },
      ],
    },
  },
];

export function getTipContent(key: string): AeoTipContent | undefined {
  return AEO_CATALOG.find((t) => t.key === key);
}

export const CATALOG_KEYS = AEO_CATALOG.map((t) => t.key);
