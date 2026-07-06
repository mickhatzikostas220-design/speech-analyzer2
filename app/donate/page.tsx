// Public "Support Speaker Hub" page (/donate). Lets anyone chip in a one-time or
// monthly donation to help fund new tools and improvements. Payments run through
// Stripe Checkout via /api/donate/checkout. Donations are anonymous and can
// never change anyone's plan. Linked from the landing footer and header.

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Wrench, Server, Check } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { SITE_NAME } from '@/lib/site';
import { DonateForm } from '@/components/marketing/DonateForm';
import { SiteFooter } from '@/components/marketing/SiteFooter';

export const metadata: Metadata = {
  title: 'Support Speaker Hub',
  description: `Chip in to help fund new tools and improvements for ${SITE_NAME}. Every dollar goes straight back into the site.`,
  robots: { index: true, follow: true },
};

// What the money actually pays for — kept honest and specific.
const USES: Array<{ icon: typeof Wrench; title: string; desc: string }> = [
  {
    icon: Wrench,
    title: 'New tools for speakers',
    desc: 'Fund the next batch of tools in the hub — the more support, the faster they ship.',
  },
  {
    icon: Sparkles,
    title: 'Smarter AI features',
    desc: 'Better transcription and analysis cost real money per run. Donations keep them sharp.',
  },
  {
    icon: Server,
    title: 'Hosting & keeping it running',
    desc: 'Servers, storage, and the free plan all have a bill attached. This helps cover it.',
  },
];

export default function DonatePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const thanks = searchParams?.thanks === '1';

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-surface-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
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

      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        {/* Thank-you banner shown after a successful Stripe checkout. */}
        {thanks ? (
          <div
            className="mb-10 flex items-start gap-3 rounded-[var(--radius-lg)] border-2 px-5 py-4"
            style={{ borderColor: 'var(--success)', background: 'var(--surface-sunk)' }}
          >
            <Check className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <p className="font-extrabold text-strong">Thank you so much.</p>
              <p className="text-sm text-muted">
                Your support goes straight back into {SITE_NAME}. It genuinely helps.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid items-start gap-12 lg:grid-cols-2">
          {/* Left: the pitch */}
          <div>
            <p className="eyebrow mb-2">Support the site</p>
            <h1 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.1 }}>
              Help keep {SITE_NAME} free and growing
            </h1>
            <p className="mt-4 text-lg text-muted">
              {SITE_NAME} is built and run by one person. If the tools have helped you, a small
              donation helps me keep them free where I can and build the next ones faster.
              <strong className="text-strong"> Every dollar goes straight back into the site</strong> —
              new tools, better AI, and the bills that keep it online.
            </p>

            <div className="mt-8 space-y-4">
              {USES.map((use) => (
                <div key={use.title} className="flex items-start gap-3.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                    style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
                  >
                    <use.icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-strong">{use.title}</h3>
                    <p className="text-sm text-muted">{use.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-faint">
              Donations are a gift to support the site — they are not a purchase and don&rsquo;t unlock
              paid plan features. Thank you for even considering it.
            </p>
          </div>

          {/* Right: the donation form */}
          <div className="lg:sticky lg:top-24">
            <DonateForm />
          </div>
        </div>
      </main>

      <SiteFooter maxWidthClass="max-w-5xl" />
    </div>
  );
}
