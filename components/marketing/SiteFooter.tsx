// Shared site footer used across the whole app — the signed-in tool pages plus
// the public About, Support/Donate, and legal pages. Every page gets the same
// links so a visitor can always reach Mick's story, support the site, read the
// legal pages, and find a way to get in touch. Purely presentational server
// component (no client JavaScript).
//
// Pass `brand` inside the signed-in app so the footer logo matches the speaker's
// hub; on public pages it falls back to the Speaker Hub default brand.

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import type { BrandKit } from '@/lib/brand/types';
import { SITE_NAME, SITE_CONTACT_EMAIL, FOUNDER_LINKEDIN } from '@/lib/site';

export function SiteFooter({
  brand = DEFAULT_BRAND,
  /** Match the content width of the page the footer sits under. */
  maxWidthClass = 'max-w-5xl',
}: {
  brand?: BrandKit;
  maxWidthClass?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-surface-card">
      <div className={`mx-auto ${maxWidthClass} px-4 py-10 sm:px-6`}>
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo brand={brand} size={20} />
            <p className="mt-3 text-sm text-muted">
              Every tool a speaker needs, in one place — built and run by one person.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol
              title="Speaker Hub"
              links={[
                ['About Mick', '/about'],
                ['Support the site', '/donate'],
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
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-faint">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href={`mailto:${SITE_CONTACT_EMAIL}`}
                    className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-strong"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {SITE_CONTACT_EMAIL}
                  </a>
                </li>
                <li>
                  <a
                    href={FOUNDER_LINKEDIN}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted transition-colors hover:text-strong"
                  >
                    Mick on LinkedIn
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--border-subtle)] pt-6 text-sm text-faint">
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
