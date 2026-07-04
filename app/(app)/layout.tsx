import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { getUserBrandState } from '@/lib/brand/server';
import { brandToCssVars, brandFontHref } from '@/lib/brand/theme';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserBrandState();

  // Auth gate: every tool in the (app) group is signed-in only. Middleware
  // normally redirects first, but its path list must name each tool — this
  // catches any tool the list misses (e.g. a newly added one).
  if (!state.userId) redirect('/login');

  // First-run gate: send un-branded speakers to set up their hub.
  if (!state.onboarded) redirect('/onboarding');

  const vars = brandToCssVars(state.brand) as CSSProperties;
  const fontHref = brandFontHref(state.brand);

  return (
    <div style={vars} className="brand-scope flex min-h-screen flex-col bg-surface-page text-body">
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <a
        href="#main"
        className="sr-only rounded-md px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        style={{ background: 'var(--surface-ink)' }}
      >
        Skip to content
      </a>
      <Navbar brand={state.brand} />
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
