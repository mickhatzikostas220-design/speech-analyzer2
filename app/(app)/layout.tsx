import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { getUserBrandState } from '@/lib/brand/server';
import { brandToCssVars, brandFontHref } from '@/lib/brand/theme';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserBrandState();

  // First-run gate: send un-branded speakers to set up their hub.
  if (state.userId && !state.onboarded) redirect('/onboarding');

  const vars = brandToCssVars(state.brand) as CSSProperties;
  const fontHref = brandFontHref(state.brand);

  return (
    <div style={vars} className="brand-scope flex min-h-screen flex-col bg-surface-page text-body">
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <Navbar brand={state.brand} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
