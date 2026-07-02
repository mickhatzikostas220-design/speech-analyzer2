// Shared shell for the public legal pages (Privacy Policy, Terms of Service).
// Presentational server component: a simple branded header, a readable prose
// column, and a slim footer. Content is passed in as plain strings so the
// page copy stays easy to edit without worrying about JSX escaping.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { SITE_NAME } from '@/lib/site';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-surface-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={SITE_NAME}>
            <Logo brand={DEFAULT_BRAND} size={20} />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="eyebrow mb-2">Legal</p>
        <h1 className="display-h1" style={{ fontSize: 'clamp(2rem, 4vw, 2.75rem)' }}>
          {title}
        </h1>
        <p className="mt-3 text-sm text-faint">Last updated: {updated}</p>
        <p className="mt-6 text-lg text-muted">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-extrabold text-strong">{section.heading}</h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-body leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-[var(--border-subtle)] bg-surface-card">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-faint sm:flex-row sm:px-6">
          <span>
            © {year} {SITE_NAME}. All rights reserved.
          </span>
          <span className="flex items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-strong">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-strong">Terms</Link>
            <Link href="/login" className="transition-colors hover:text-strong">Log in</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
