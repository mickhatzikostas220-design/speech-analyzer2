import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/brand/Logo';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';

const ADMIN_EMAIL = 'mickhatzikostas220@gmail.com';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="sticky top-0 z-40 bg-[color:var(--surface-ink)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo brand={DEFAULT_BRAND} color="paper" size={18} />
            <span className="rounded-[var(--radius-pill)] border border-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/70">
              Admin
            </span>
          </div>
          <a href="/dashboard" className="text-xs font-medium text-white/60 transition-colors hover:text-white">
            ← Back to hub
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
