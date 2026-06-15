'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/brand/Logo';
import type { BrandKit } from '@/lib/brand/types';

export function Navbar({ brand }: { brand: BrandKit }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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
            {link('/dashboard', 'Hub')}
            {link('/history', 'History')}
            {link('/compare', 'Compare')}
            {link('/editor', 'Editor')}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/settings"
            className={`text-sm font-semibold transition-colors ${
              pathname.startsWith('/settings') ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium text-white/50 transition-colors hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
