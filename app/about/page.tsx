// Public "About Mick" page (/about). Introduces the person behind Speaker Hub —
// who he is, why he built it, and where it's going — and points visitors to the
// Support page. Linked from the landing footer.
//
// NOTE for Mick: to show your real photo, save it to the /public folder as
// public/mick.jpg (that's the path in PROFILE.photo below). Until that file
// exists, the page automatically shows your initials instead — nothing breaks.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Heart, Linkedin } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { SITE_NAME } from '@/lib/site';
import { AboutPhoto } from '@/components/marketing/AboutPhoto';

export const metadata: Metadata = {
  title: 'About Mick',
  description: `Meet the person behind ${SITE_NAME} — why it exists and where it's headed.`,
  robots: { index: true, follow: true },
};

// --- Editable content -------------------------------------------------------
const PROFILE = {
  name: 'Michael Hatzikostas',
  initials: 'M',
  // A one-line hook shown under the name.
  tagline: `15-year-old builder of ${SITE_NAME} — made for speakers like my mom.`,
  // Save your photo here (public/mick.jpg) and it shows automatically.
  photo: '/mick.jpg',
  linkedin: 'https://www.linkedin.com/in/mick-hatzikostas-b655a3405/',
};

// Each entry is a section of the story. Headings are optional.
const STORY: Array<{ heading?: string; paragraphs: string[] }> = [
  {
    paragraphs: [
      `Hi, I'm Michael Hatzikostas — most people call me Mick. I'm 15, and I'm from Connecticut.`,
      `I grew up around my mom, Erin Hatzikostas, who built a career as a professional speaker. I had a front-row seat as she worked new technology into what she does — and I saw just how much of it there was.`,
    ],
  },
  {
    heading: `Why I built ${SITE_NAME}`,
    paragraphs: [
      `The problem my mom kept running into wasn't a lack of tools — it was the opposite. There was all this powerful tech, but it was scattered across a dozen different apps and a pain to set up. Great technology that was simply too much of a hassle to actually use.`,
      `That's why I built ${SITE_NAME}: to bring the newest tech together in one easy, one-stop shop, so my mom and speakers like her can spend their time on their message instead of wrestling with ten different tools.`,
      `I've been coding for a while — I learned HTML and Python at a coding school called The Coder School — and ${SITE_NAME} is the biggest thing I've built so far.`,
    ],
  },
  {
    heading: 'Where it’s going',
    paragraphs: [
      `My hope is that ${SITE_NAME} reaches speakers everywhere and helps propel the great messages and teachings they have to share. If it saves them time and helps even one more person hear what they have to say, that's a win.`,
      `It's built and run by one 15-year-old, so every bit of support genuinely helps me keep improving it and adding new tools.`,
    ],
  },
];
// ---------------------------------------------------------------------------

export default function AboutPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-surface-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={SITE_NAME}>
            <Logo brand={DEFAULT_BRAND} size={20} />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {/* Intro: photo + name */}
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <AboutPhoto src={PROFILE.photo} initials={PROFILE.initials} alt={`Photo of ${PROFILE.name}`} />
          <div>
            <p className="eyebrow mb-2">About</p>
            <h1 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)' }}>
              {PROFILE.name}
            </h1>
            <p className="mt-2 text-lg text-muted">{PROFILE.tagline}</p>
            <a
              href={PROFILE.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline mt-4 inline-flex"
            >
              <Linkedin className="h-4 w-4" /> Connect on LinkedIn
            </a>
          </div>
        </div>

        {/* Story */}
        <div className="mt-12 space-y-9">
          {STORY.map((section, i) => (
            <section key={i}>
              {section.heading ? (
                <h2 className="text-xl font-extrabold text-strong">{section.heading}</h2>
              ) : null}
              <div className={`${section.heading ? 'mt-3' : ''} space-y-3`}>
                {section.paragraphs.map((p, j) => (
                  <p key={j} className="text-body leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* CTA to support */}
        <div
          className="mt-14 flex flex-col items-start gap-4 rounded-[var(--radius-lg)] border-2 p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-card)' }}
        >
          <div>
            <h2 className="text-lg font-extrabold text-strong">Want to help it grow?</h2>
            <p className="mt-1 text-sm text-muted">
              Every donation goes straight back into new tools and keeping {SITE_NAME} online.
            </p>
          </div>
          <Link href="/donate" className="btn-primary shrink-0">
            <Heart className="h-4 w-4" /> Support the site <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-surface-card">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-faint sm:flex-row sm:px-6">
          <span>
            © {year} {SITE_NAME}. All rights reserved.
          </span>
          <span className="flex items-center gap-4">
            <Link href="/donate" className="transition-colors hover:text-strong">Support</Link>
            <Link href="/privacy" className="transition-colors hover:text-strong">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-strong">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
