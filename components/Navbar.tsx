'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';
import type { BrandKit } from '@/lib/brand/types';
import { toolByKey, type ToolMeta } from '@/lib/tools/catalog';

const NAV_ITEMS: Array<[string, string]> = [
  ['/dashboard', 'Hub'],
  ['/agent', 'Assistant'],
  ['/bookings', 'Bookings'],
  ['/history', 'Library'],
  ['/editor', 'Studio'],
  ['/keynotes', 'Keynotes'],
  ['/clipflow', 'ClipFlow'],
];

export function Navbar({ brand, favorites = [] }: { brand: BrandKit; favorites?: string[] }) {
  const pathname = usePathname();
  // Resolve pinned tool keys to their catalog metadata (dropping any unknowns).
  const pinned: ToolMeta[] = favorites
    .map((key) => toolByKey(key))
    .filter((t): t is ToolMeta => Boolean(t));
  const router = useRouter();
  const supabase = createClient();
  // Controls the mobile dropdown menu (hidden on >= sm screens).
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`border-b-2 pb-0.5 text-sm font-semibold transition-colors ${
          active
            ? 'border-signature text-white'
            : 'border-transparent text-white/60 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[color:var(--surface-ink)]">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-7">
          <Link href="/dashboard" className="flex items-center">
            <Logo brand={brand} color="paper" size={20} />
          </Link>
          <nav className="hidden items-center gap-5 sm:flex">
            {NAV_ITEMS.map(([href, label]) => link(href, label))}
            {/* Pinned tools — the speaker's favorites, as compact icon links. */}
            {pinned.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="mr-1 h-4 w-px bg-white/15" aria-hidden />
                {pinned.map((tool) => {
                  const active = pathname.startsWith(tool.href);
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.key}
                      href={tool.href}
                      title={tool.name}
                      aria-label={tool.name}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                        active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className={`hidden text-sm font-semibold transition-colors sm:inline ${
              pathname.startsWith('/settings') ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="hidden text-xs font-medium text-white/50 transition-colors hover:text-white sm:inline"
          >
            Sign out
          </button>

          {/* Mobile menu toggle — only shown below the sm breakpoint. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="text-white/80 transition-colors hover:text-white sm:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen ? (
        <nav className="border-t border-white/10 bg-[color:var(--surface-ink)] px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(([href, label]) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            {/* Pinned tools section — full-width links with the tool icon. */}
            {pinned.length > 0 && (
              <>
                <div className="my-1 border-t border-white/10" />
                <p className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-white/40">
                  Pinned
                </p>
                {pinned.map((tool) => {
                  const active = pathname.startsWith(tool.href);
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.key}
                      href={tool.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                        active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                      {tool.name}
                    </Link>
                  );
                })}
                <div className="my-1 border-t border-white/10" />
              </>
            )}
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                pathname.startsWith('/settings')
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              Settings
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                handleSignOut();
              }}
              className="rounded-md px-3 py-2 text-left text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
