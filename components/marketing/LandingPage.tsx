// Public marketing landing page shown to logged-out visitors at "/".
// It explains what Speaker Hub is, showcases the real tools, lays out pricing
// and an FAQ, and drives people to sign up. This is a purely presentational
// server component — no client-side JavaScript is required (the FAQ uses the
// native <details> element and the header links are plain anchors).

import Link from 'next/link';
import {
  Mic,
  Bot,
  Inbox,
  PenLine,
  Clapperboard,
  GitCompareArrows,
  Library,
  Search,
  Lightbulb,
  Check,
  Plus,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { PLANS } from '@/lib/subscription/plans';
import { SITE_NAME } from '@/lib/site';
import { FAQS } from '@/components/marketing/content';
import { StructuredData } from '@/components/marketing/StructuredData';

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

interface Feature {
  icon: LucideIcon;
  name: string;
  desc: string;
  bg: string;
  fg: string;
}

const FEATURES: Feature[] = [
  {
    icon: Mic,
    name: 'Speech Analyzer',
    desc: 'Upload a talk and get an AI engagement map — see exactly where the room leaned in, and where it drifted.',
    bg: 'var(--signature)',
    fg: 'var(--on-signature)',
  },
  {
    icon: PenLine,
    name: 'Script Studio',
    desc: 'Draft, sharpen, and rehearse your keynote with an editor that helps it sound unmistakably like you.',
    bg: 'var(--red)',
    fg: '#fff',
  },
  {
    icon: Clapperboard,
    name: 'Talk Editor',
    desc: 'Cut highlight reels and share-ready clips straight from your recorded talks — no video editor needed.',
    bg: 'var(--blue)',
    fg: '#fff',
  },
  {
    icon: Inbox,
    name: 'Booking Inbox',
    desc: 'Track every speaking request from first hello to a confirmed gig on your calendar, in one tidy pipeline.',
    bg: 'var(--success)',
    fg: '#fff',
  },
  {
    icon: Bot,
    name: 'AI Assistant',
    desc: 'A personal agent that knows your talks, drafts your emails, and connects your calendar and inbox.',
    bg: 'var(--accent-2)',
    fg: '#fff',
  },
  {
    icon: GitCompareArrows,
    name: 'Compare Talks',
    desc: 'Put two performances side by side and see what actually moved the room — then do more of it.',
    bg: 'var(--ink-900)',
    fg: 'var(--signature)',
  },
  {
    icon: Search,
    name: 'SEO & AEO',
    desc: 'Drop in your website and get tips to rank on Google and get cited by AI answer engines.',
    bg: 'var(--accent-2)',
    fg: '#fff',
  },
  {
    icon: Lightbulb,
    name: 'Coaching Tips',
    desc: 'A fresh, practical coaching tip every week — schedule the ones you want to work on and check them off.',
    bg: 'var(--yellow-400)',
    fg: 'var(--ink-900)',
  },
  {
    icon: Library,
    name: 'Talk Library',
    desc: 'Every talk you have analyzed, organized and ready to revisit whenever you prep your next one.',
    bg: 'var(--pink-200)',
    fg: 'var(--ink-900)',
  },
];

const STEPS: Array<{ title: string; desc: string }> = [
  {
    title: 'Upload your talk',
    desc: 'Drop in a recording or paste a transcript. Speaker Hub transcribes and reads it in minutes.',
  },
  {
    title: 'See your engagement map',
    desc: 'Get a clear score plus the exact moments the room leaned in — and the ones where attention slipped.',
  },
  {
    title: 'Ship your best work',
    desc: 'Tighten the weak spots, cut clips to share, and walk on stage knowing your talk is ready.',
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <StructuredData />
      <a
        href="#main"
        className="sr-only rounded-md px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        style={{ background: 'var(--surface-ink)' }}
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <TrustBar />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-surface-card">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label={SITE_NAME}>
          <Logo brand={DEFAULT_BRAND} size={20} />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-muted md:flex">
          <a href="#features" className="transition-colors hover:text-strong">Features</a>
          <a href="#how" className="transition-colors hover:text-strong">How it works</a>
          <a href="#pricing" className="transition-colors hover:text-strong">Pricing</a>
          <a href="#faq" className="transition-colors hover:text-strong">FAQ</a>
          {/* Public support page — a Link, not an anchor, since it's a real route. */}
          <Link href="/donate" className="transition-colors hover:text-strong">Support</Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/login" className="btn-ghost hidden sm:inline-flex">Log in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand-color glows behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: 'var(--yellow-300)' }}
        />
        <div
          className="absolute -right-16 top-16 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--blue-300)' }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--pink-300)' }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <p className="eyebrow mb-3">Built for professional speakers</p>
          <h1 className="display-h1" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', lineHeight: 1.05 }}>
            Every tool a speaker needs,{' '}
            <span className="script" style={{ fontSize: '1.3em', color: 'var(--accent-2)' }}>
              in one place.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted">
            Analyze your talks with AI, sharpen your scripts, manage your bookings, and cut shareable
            clips — all in a hub that stays unmistakably you.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary" style={{ boxShadow: 'var(--shadow-hard)' }}>
              Start free <ArrowUpRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="btn-outline">
              See what&rsquo;s inside
            </a>
          </div>
          <p className="mt-4 text-sm text-faint">
            No credit card required · 3 free talk analyses every month
          </p>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** A lightweight mock of the Speech Analyzer result — pure CSS, no assets. */
function HeroVisual() {
  const bars = [38, 52, 66, 84, 78, 58, 44, 61, 80, 93, 88, 72, 55, 68, 83, 90];
  const bandColor = (h: number) =>
    h >= 75 ? 'var(--score-high)' : h >= 55 ? 'var(--score-mid)' : 'var(--score-low)';

  return (
    <div className="relative">
      <div
        className="card p-6"
        style={{ boxShadow: 'var(--shadow-hard-lg)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow mb-1">Engagement map</p>
            <h3 className="text-lg font-extrabold text-strong">Closing keynote — draft 3</h3>
          </div>
          <div
            className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl text-white"
            style={{ background: 'var(--score-high)' }}
          >
            <span className="text-xl font-black leading-none">87</span>
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">score</span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="mt-6 flex h-28 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm"
              style={{ height: `${h}%`, background: bandColor(h) }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-semibold text-faint">
          <span>0:00</span>
          <span>Peak at 6:40</span>
          <span>12:30</span>
        </div>

        {/* Insight rows */}
        <div className="mt-5 space-y-2">
          <InsightRow tone="high" text="Story at 6:40 landed — biggest lean-in of the talk." />
          <InsightRow tone="low" text="Attention dipped at 9:10 — tighten the data section." />
        </div>
      </div>

      {/* Floating accent chip */}
      <div
        className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-pill border-2 px-4 py-2 text-sm font-bold sm:flex"
        style={{
          background: 'var(--yellow-400)',
          color: 'var(--ink-900)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-hard)',
        }}
      >
        <Check className="h-4 w-4" /> 3 clips ready to share
      </div>
    </div>
  );
}

function InsightRow({ tone, text }: { tone: 'high' | 'low'; text: string }) {
  const dot = tone === 'high' ? 'var(--score-high)' : 'var(--score-low)';
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-surface-sunk px-3 py-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="text-sm text-body">{text}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust bar                                                          */
/* ------------------------------------------------------------------ */

function TrustBar() {
  const items = [
    ['Minutes', 'from upload to insight'],
    ['9 tools', 'in one branded hub'],
    ['Every week', 'a fresh coaching tip'],
  ];
  return (
    <section className="border-y border-[var(--border-subtle)] bg-surface-card">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
        {items.map(([big, small]) => (
          <div key={big} className="text-center">
            <div className="text-2xl font-black text-strong">{big}</div>
            <div className="text-sm text-muted">{small}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <p className="eyebrow mb-2">Everything in one hub</p>
        <h2 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          Stop juggling ten tools
        </h2>
        <p className="mt-4 text-lg text-muted">
          Prep, analysis, bookings, content — Speaker Hub keeps all of it in one place, styled to
          your brand.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.name}
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-soft"
          >
            <span
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
              style={{ background: f.bg, color: f.fg }}
            >
              <f.icon className="h-6 w-6" strokeWidth={2.25} />
            </span>
            <h3 className="text-lg font-extrabold text-strong">{f.name}</h3>
            <p className="mt-1.5 text-sm text-muted">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  How it works                                                       */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-[var(--border-subtle)] bg-surface-card">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="eyebrow mb-2">How it works</p>
          <h2 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
            From recording to standing ovation
          </h2>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black"
                style={{
                  background: 'var(--signature)',
                  color: 'var(--on-signature)',
                  boxShadow: 'var(--shadow-hard)',
                }}
              >
                {i + 1}
              </div>
              <h3 className="mt-5 text-xl font-extrabold text-strong">{s.title}</h3>
              <p className="mt-2 text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing                                                            */
/* ------------------------------------------------------------------ */

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow mb-2">Pricing</p>
        <h2 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
          Start free. Upgrade when you are ready.
        </h2>
        <p className="mt-4 text-lg text-muted">
          Simple month-to-month plans. Cancel anytime, no lock-in.
        </p>
      </div>

      <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const highlighted = Boolean(plan.highlighted);
          return (
            <div
              key={plan.id}
              className="relative flex h-full flex-col rounded-[var(--radius-lg)] border bg-surface-card p-7"
              style={{
                borderColor: highlighted ? 'var(--border-strong)' : 'var(--border-subtle)',
                borderWidth: highlighted ? 2 : 1,
                boxShadow: highlighted ? 'var(--shadow-hard)' : 'var(--shadow-sm)',
              }}
            >
              {highlighted && (
                <span
                  className="absolute -top-3 left-7 rounded-pill px-3 py-1 text-xs font-black uppercase tracking-wide"
                  style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
                >
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-extrabold text-strong">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-black text-strong">${plan.price}</span>
                <span className="text-sm font-semibold text-muted">/mo</span>
              </div>
              <p className="mt-2 min-h-[40px] text-sm text-muted">{plan.tagline}</p>

              <Link
                href="/signup"
                className={highlighted ? 'btn-primary mt-5 w-full' : 'btn-outline mt-5 w-full'}
              >
                {plan.price === 0 ? 'Get started free' : `Choose ${plan.name}`}
              </Link>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-body">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--success)' }} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-[var(--border-subtle)] bg-surface-card">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <p className="eyebrow mb-2">Questions</p>
          <h2 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
            Good questions, straight answers
          </h2>
        </div>

        <div className="mt-10 space-y-3">
          {FAQS.map((item) => (
            <details
              key={item.q}
              className="group rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-surface-page p-5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-strong [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="mt-3 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                          */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div
        className="mx-auto max-w-5xl overflow-hidden rounded-[var(--radius-xl)] px-8 py-16 text-center"
        style={{ background: 'var(--surface-ink)' }}
      >
        <h2
          className="mx-auto max-w-2xl font-display font-black text-white"
          style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.1 }}
        >
          Your next talk deserves a hub this good.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
          Join Speaker Hub free and see exactly where your audience leans in.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary" style={{ boxShadow: 'var(--shadow-hard)' }}>
            Start free <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn-outline" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
            Log in
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-surface-page">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo brand={DEFAULT_BRAND} size={20} />
            <p className="mt-3 text-sm text-muted">
              Every tool a speaker needs, in one place — analyze, prepare, book, and share.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <FooterCol
              title="Product"
              links={[
                ['Features', '#features'],
                ['How it works', '#how'],
                ['Pricing', '#pricing'],
                ['FAQ', '#faq'],
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                ['About', '/about'],
                ['Support', '/donate'],
              ]}
            />
            <FooterCol
              title="Account"
              links={[
                ['Log in', '/login'],
                ['Sign up', '/signup'],
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                ['Privacy', '/privacy'],
                ['Terms', '/terms'],
                ['Cookies', '/cookies'],
              ]}
            />
          </div>
        </div>
        <div className="mt-10 border-t border-[var(--border-subtle)] pt-6 text-sm text-faint">
          © {year} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-faint">{title}</h4>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-muted transition-colors hover:text-strong">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
