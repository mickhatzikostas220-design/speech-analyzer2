// Coaching Tips. Free users see one rotating tip per week (read-only); paid
// users get the full planner — schedule tips and check them off.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lightbulb, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/subscription/server';
import { weeklyTip } from '@/lib/tips/weekly';
import { TipsPlanner, type UserTip } from '@/components/tips/TipsPlanner';

export const dynamic = 'force-dynamic';

export default async function TipsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const plan = await getUserPlan(supabase);
  const isPaid = plan !== 'free';
  const tip = weeklyTip();

  let initialTips: UserTip[] = [];
  if (isPaid) {
    const { data } = await supabase
      .from('user_tips')
      .select('*')
      .order('completed', { ascending: true })
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    initialTips = (data as UserTip[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Coaching Tips</p>
      <h1 className="display-h1 mb-1">Sharpen one thing at a time</h1>
      <p className="mb-8 text-muted">
        {isPaid
          ? 'Schedule the tips you want to work on and check them off as you go.'
          : 'A fresh coaching tip every week to level up your speaking.'}
      </p>

      {/* Tip of the week — everyone sees this */}
      <div
        className="mb-8 rounded-[var(--radius-lg)] p-5"
        style={{
          background: 'var(--signature)',
          color: 'var(--on-signature)',
          border: '2px solid var(--border-strong)',
          boxShadow: 'var(--shadow-hard-lg)',
        }}
      >
        <div className="mb-2 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>
          <Lightbulb className="h-4 w-4" strokeWidth={2.25} /> Tip of the week
        </div>
        <p className="text-base font-bold">{tip.title}</p>
        <p className="mt-1 text-sm" style={{ opacity: 0.92 }}>{tip.body}</p>
      </div>

      {isPaid ? (
        <TipsPlanner initialTips={initialTips} />
      ) : (
        <Link
          href="/settings/plans"
          className="card flex items-center justify-between gap-4 p-5 transition hover:border-strong"
        >
          <div>
            <p className="font-bold text-strong">Want more than one tip a week?</p>
            <p className="mt-0.5 text-sm text-muted">
              Upgrade to schedule tips on your calendar and check them off as you complete them.
            </p>
          </div>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-muted" />
        </Link>
      )}
    </div>
  );
}
