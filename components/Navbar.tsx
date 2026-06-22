'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';
import type { BrandKit } from '@/lib/brand/types';

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/dashboard', label: 'Hub' },
  { href: '/agent', label: 'Assistant' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/history', label: 'Library' },
  { href: '/editor', label: 'Studio' },
  { href: '/clipflow', label: 'ClipFlow' },
];

export function Navbar({ brand }: { brand: BrandKit }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock background scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isActive = (href: string) => pathname.startsWith(href);

  const desktopLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={`border-b-2 pb-0.5 text-sm font-semibold transition-colors ${
        isActive(href)
          ? 'border-signature text-white'
          : 'border-transparent text-white/60 hover:text-white'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 bg-[color:var(--surface-ink)]">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-7">
          <Link href="/dashboard" className="flex items-center" aria-label="Go to your hub">
            <Logo brand={brand} color="paper" size={20} />
          </Link>
          <nav className="hidden items-center gap-5 sm:flex">
            {NAV_LINKS.map((l) => desktopLink(l.href, l.label))}
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Primary action — one tap to start a new analysis from anywhere. */}
          <Link
            href="/analyze"
            className="inline-flex items-center gap-1.5 rounded-full bg-signature px-3.5 py-1.5 text-xs font-bold text-on-signature transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New talk</span>
          </Link>

          {/* Desktop-only secondary links */}
          <Link
            href="/settings"
            className={`hidden text-sm font-semibold transition-colors sm:inline ${
              isActive('/settings') ? 'text-white' : 'text-white/60 hover:text-white'
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

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="-mr-1 p-1.5 text-white/80 transition-colors hover:text-white sm:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="sm:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-16 z-30 bg-black/40"
          />
          <nav className="relative z-40 flex flex-col gap-1 border-t border-white/10 bg-[color:var(--surface-ink)] px-4 pb-4 pt-2">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-2.5 text-base font-semibold transition-colors ${
                  isActive(l.href)
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-white/10" />
            <Link
              href="/settings"
              className={`rounded-lg px-3 py-2.5 text-base font-semibold transition-colors ${
                isActive('/settings')
                  ? 'bg-white/10 text-white'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              Settings
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-2.5 text-left text-base font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
