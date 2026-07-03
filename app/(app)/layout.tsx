import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { getUserBrandState } from '@/lib/brand/server';
import { getFavoriteTools } from '@/lib/tools/favorites';
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

  // Tools the speaker pinned — rendered as quick links in the top bar.
  const favoriteTools = await getFavoriteTools();

  return (
    <div style={vars} className="brand-scope flex min-h-screen flex-col bg-surface-page text-body">
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <Navbar brand={state.brand} favorites={favoriteTools} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
