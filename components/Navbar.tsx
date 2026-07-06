'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';
import type { BrandKit } from '@/lib/brand/types';
import { toolByKey, toolIsComingSoon, type ToolMeta } from '@/lib/tools/catalog';

// The top bar shows the Hub tab plus the speaker's favorited tools — nothing
// else. The old fixed tool tabs were removed so each speaker's bar reflects the
// five tools they picked in onboarding (managed later via the Hub's stars).
const HUB: [string, string] = ['/dashboard', 'Hub'];

export function Navbar({ brand, favorites = [] }: { brand: BrandKit; favorites?: string[] }) {
  const pathname = usePathname();
  // Resolve pinned tool keys to their catalog metadata (dropping any unknowns,
  // and any tool that's still "coming soon" so we never pin a locked tool).
  const pinned: ToolMeta[] = favorites
    .map((key) => toolByKey(key))
    .filter((t): t is ToolMeta => Boolean(t) && !toolIsComingSoon(t as ToolMeta));
  const router = useRouter();
  const supabase = createClient();
  // Controls the mobile dropdown menu (hidden on >= sm screens).
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
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
            {link(HUB[0], HUB[1])}
            {/* The speaker's favorited tools — shown by name, not icon. */}
            {pinned.map((tool) => link(tool.href, tool.name))}
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
            {/* Hub tab plus the speaker's favorited tools, shown by name. */}
            {([HUB, ...pinned.map((t) => [t.href, t.name] as [string, string])]).map(
              ([href, label]) => {
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
              }
            )}
            <div className="my-1 border-t border-white/10" />
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
