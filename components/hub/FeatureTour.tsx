'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Mic,
  Bot,
  Inbox,
  PenLine,
  Clapperboard,
  Share2,
  GitCompareArrows,
  Library,
  Sparkles,
  Compass,
  X,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';

const STORAGE_KEY = 'speech-analyzer:feature-tour:v1';
/** Other components can dispatch this on `window` to (re)open the tour. */
export const OPEN_TOUR_EVENT = 'feature-tour:open';

interface Stop {
  icon: LucideIcon;
  name: string;
  /** Plain-language summary of what the feature is. */
  what: string;
  /** Numbered, do-this-then-that steps for actually using it. */
  how: string[];
  href: string;
  cta: string;
  bg: string;
  fg: string;
}

const STOPS: Stop[] = [
  {
    icon: Mic,
    name: 'Speech Analyzer',
    what:
      'The heart of the app. Upload a recorded talk and get a timestamped read on exactly where the room leaned in — and where attention drifted.',
    how: [
      'Open the Speech Analyzer and drop in a video or audio file of your talk.',
      'Wait a moment while it transcribes and scores engagement second by second.',
      'Scroll the timeline to jump to the high and low moments — those are your edit notes.',
    ],
    href: '/analyze',
    cta: 'Try the analyzer',
    bg: 'var(--signature)',
    fg: 'var(--on-signature)',
  },
  {
    icon: Library,
    name: 'Talk Library',
    what:
      'Every talk you’ve analyzed, organized in one place and ready to revisit, compare, or turn into clips.',
    how: [
      'Head to Library to see all your past analyses.',
      'Click any talk to reopen its full engagement breakdown.',
      'Use it as your home base before editing or comparing talks.',
    ],
    href: '/history',
    cta: 'Open the library',
    bg: 'var(--pink-200)',
    fg: 'var(--ink-900)',
  },
  {
    icon: GitCompareArrows,
    name: 'Compare',
    what:
      'Put two talks side by side to see what actually moved the room — great for tracking progress or testing two versions of a story.',
    how: [
      'Go to Compare and pick two analyzed talks.',
      'Read their engagement curves next to each other.',
      'Note which choices kept attention and carry them into your next talk.',
    ],
    href: '/compare',
    cta: 'Compare talks',
    bg: 'var(--ink-900)',
    fg: 'var(--signature)',
  },
  {
    icon: PenLine,
    name: 'Script Studio',
    what:
      'Draft, sharpen, and rehearse your keynote with writing help that learns to sound like you — not a generic robot.',
    how: [
      'Open Script Studio and start a new script or paste an existing draft.',
      'Use the AI suggestions to tighten openings, transitions, and closers.',
      'Rehearse against it, then record and run it through the analyzer.',
    ],
    href: '/editor/script',
    cta: 'Write a script',
    bg: 'var(--red)',
    fg: '#fff',
  },
  {
    icon: Clapperboard,
    name: 'Talk Studio',
    what:
      'A lightweight video editor for cutting highlight reels and shareable clips straight from your recorded talks.',
    how: [
      'Open Studio and choose a recorded talk to edit.',
      'Trim on the timeline to pull out your strongest moments.',
      'Export a clip ready to post or send to organizers.',
    ],
    href: '/editor',
    cta: 'Open the studio',
    bg: 'var(--blue)',
    fg: '#fff',
  },
  {
    icon: Share2,
    name: 'ClipFlow',
    what:
      'Turn finished clips into a steady social presence — schedule and post highlights to your connected accounts.',
    how: [
      'Connect your social accounts in ClipFlow.',
      'Pick clips you’ve made in Studio.',
      'Schedule or publish them without leaving the app.',
    ],
    href: '/clipflow',
    cta: 'Set up ClipFlow',
    bg: 'var(--accent-2)',
    fg: '#fff',
  },
  {
    icon: Inbox,
    name: 'Booking Inbox',
    what:
      'Track speaking requests from the first hello all the way to a confirmed gig on your calendar.',
    how: [
      'Share your booking page so organizers can reach out.',
      'New inquiries land in your Booking Inbox.',
      'Move each one along the pipeline until the date is locked in.',
    ],
    href: '/bookings',
    cta: 'See your inbox',
    bg: 'var(--success)',
    fg: '#fff',
  },
  {
    icon: Bot,
    name: 'Assistant',
    what:
      'Your personal AI agent. It knows your talks, drafts your emails, and connects the apps you already use.',
    how: [
      'Open the Assistant and ask it anything about your talks or bookings.',
      'Let it draft replies to organizers or summarize an analysis.',
      'Connect your tools in its settings so it can act on your behalf.',
    ],
    href: '/agent',
    cta: 'Meet your assistant',
    bg: 'var(--accent-2)',
    fg: '#fff',
  },
  {
    icon: Sparkles,
    name: 'Brand Kit',
    what:
      'Your colors, logo, fonts, and voice. It keeps the whole hub — and everything you send out — unmistakably you.',
    how: [
      'Open Settings to fine-tune your brand kit.',
      'Adjust colors, logo, and fonts; everything updates live.',
      'Set your voice so AI-written copy sounds like you.',
    ],
    href: '/settings',
    cta: 'Tune your brand',
    bg: 'var(--ink-100)',
    fg: 'var(--ink-900)',
  },
];

/** A small pill button that (re)opens the tour from anywhere on the page. */
export function TourButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong ${className}`}
    >
      <Compass className="h-4 w-4" />
      Take a tour
    </button>
  );
}

/**
 * A welcome walkthrough that introduces every feature to first-time users.
 * Auto-opens once per browser after sign-up; can be replayed via TourButton
 * or by dispatching the OPEN_TOUR_EVENT.
 */
export function FeatureTour({ brandName }: { brandName?: string }) {
  const [open, setOpen] = useState(false);
  // -1 is the welcome screen; 0..n-1 are feature stops.
  const [index, setIndex] = useState(-1);

  const start = useCallback(() => {
    setIndex(-1);
    setOpen(true);
  }, []);

  // Auto-open for brand-new users; always allow manual reopen.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === 'done';
    } catch {
      /* storage blocked — just don't auto-open */
      seen = true;
    }
    if (!seen) start();

    const handler = () => start();
    window.addEventListener(OPEN_TOUR_EVENT, handler);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, handler);
  }, [start]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'done');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  // Lock scroll + wire keyboard nav while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, STOPS.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, finish]);

  if (!open) return null;

  const isWelcome = index < 0;
  const stop = isWelcome ? null : STOPS[index];
  const isLast = index === STOPS.length - 1;
  const first = (brandName || '').split(' ')[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(17,17,17,0.55)', backdropFilter: 'blur(2px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      onClick={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card shadow-soft">
        <button
          type="button"
          onClick={finish}
          aria-label="Close tour"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--surface-sunk)] hover:text-strong"
        >
          <X className="h-4 w-4" />
        </button>

        {isWelcome ? (
          <div className="px-7 py-10 sm:px-10">
            <span
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-[16px]"
              style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
            >
              <Compass className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <p className="eyebrow mb-2">Welcome aboard</p>
            <h2 className="display-h1 mb-3">
              {first ? `Hey ${first} — ` : ''}
              <span className="script" style={{ fontSize: '1.2em' }}>
                here’s the grand tour.
              </span>
            </h2>
            <p className="text-muted">
              This is your speaking hub — everything from analyzing a talk to booking the next gig
              lives here. Let’s walk through each tool, what it does, and how to use it. It takes
              about a minute.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <button type="button" onClick={() => setIndex(0)} className="btn-primary">
                Show me around
                <ChevronRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={finish} className="btn-ghost">
                Skip for now
              </button>
            </div>
          </div>
        ) : (
          stop && (
            <div className="px-7 py-9 sm:px-10">
              <span
                className="mb-5 flex h-14 w-14 items-center justify-center rounded-[16px]"
                style={{ background: stop.bg, color: stop.fg }}
              >
                <stop.icon className="h-7 w-7" strokeWidth={2.25} />
              </span>
              <p className="eyebrow mb-2">
                Tool {index + 1} of {STOPS.length}
              </p>
              <h2 className="text-2xl font-extrabold text-strong">{stop.name}</h2>
              <p className="mt-2 text-muted">{stop.what}</p>

              <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--surface-sunk)] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-faint">
                  How to use it
                </p>
                <ol className="space-y-2">
                  {stop.how.map((h, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-body">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
                      >
                        {i + 1}
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <Link
                href={stop.href}
                onClick={finish}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--signature)] hover:underline"
              >
                {stop.cta}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )
        )}

        {/* footer: progress + nav */}
        {!isWelcome && (
          <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] px-7 py-4 sm:px-10">
            <div className="flex items-center gap-1.5">
              {STOPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to tool ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? 18 : 6,
                    background: i === index ? 'var(--signature)' : 'var(--border-subtle)',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(i - 1, -1))}
                className="btn-ghost"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {isLast ? (
                <button type="button" onClick={finish} className="btn-primary">
                  Get started
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.min(i + 1, STOPS.length - 1))}
                  className="btn-primary"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
