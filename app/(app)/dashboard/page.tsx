import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getUserBrandState } from '@/lib/brand/server';
import { createClient } from '@/lib/supabase/server';
import { getUpcomingGigs } from '@/lib/gigs/server';
import { getBookings } from '@/lib/bookings/server';
import { ToolGrid } from '@/components/hub/ToolGrid';
import { getFavoriteTools } from '@/lib/tools/favorites';
import { RecentActivity } from '@/components/hub/RecentActivity';
import { StatTiles, type Stat } from '@/components/hub/StatTiles';
import { UpcomingGigs } from '@/components/hub/UpcomingGigs';
import { TipCard } from '@/components/hub/TipCard';
import { getUserPlan } from '@/lib/subscription/server';
import type { Analysis } from '@/types';

export const dynamic = 'force-dynamic';

function buildTip(completed: Analysis[], avg: number | null): string {
  if (completed.length) {
    const weakest = completed.reduce((m, a) => ((a.overall_score ?? 100) < (m.overall_score ?? 100) ? a : m));
    if ((weakest.overall_score ?? 100) < 70) {
      return `Your “${weakest.title}” talk scored ${weakest.overall_score}. Open it up and tighten the moments where attention dipped.`;
    }
    return `You’re landing strong${avg != null ? ` — ${avg} average` : ''}. Keep the energy in your first 90 seconds and you’ll keep the room.`;
  }
  return 'Run your first talk through the Speech Analyzer — it shows where the room leans in and where it drifts, so you know exactly what to tighten.';
}

export default async function HubPage() {
  const { brand, userId } = await getUserBrandState();
  const supabase = createClient();

  let recent: Analysis[] = [];
  let scores: number[] = [];
  let totalTalks = 0;
  try {
    const [{ data: recentData }, { data: scoreData, count }] = await Promise.all([
      supabase.from('analyses').select('*').order('created_at', { ascending: false }).limit(6),
      supabase
        .from('analyses')
        .select('overall_score', { count: 'exact' })
        .eq('status', 'complete')
        .not('overall_score', 'is', null),
    ]);
    recent = (recentData as Analysis[]) ?? [];
    scores = ((scoreData as { overall_score: number }[]) ?? []).map((r) => r.overall_score);
    totalTalks = count ?? scores.length;
  } catch {
    /* analyses table may be absent in a fresh project */
  }

  const { gigs, calendarUrl } = userId
    ? await getUpcomingGigs(supabase, userId)
    : { gigs: [], calendarUrl: null };
  const { newCount: newInquiries } = userId
    ? await getBookings(supabase, userId)
    : { newCount: 0 };

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.max(...scores) : null;
  const completed = recent.filter((a) => a.status === 'complete' && a.overall_score !== null);

  const stats: Stat[] = [
    { value: String(totalTalks), label: 'Talks analyzed', tone: 'plain' },
    { value: avg != null ? String(avg) : '—', label: 'Avg score', tone: 'signature' },
    { value: best != null ? String(best) : '—', label: 'Best score', tone: 'ink' },
  ];

  const first = (brand.name || 'there').split(' ')[0];

  // Plan still drives which tools appear unlocked in the grid; the Speech
  // Analyzer itself is free and unlimited, so there's no quota to surface here.
  const plan = await getUserPlan(supabase);

  // Which tools this speaker has pinned — drives the star state on each card.
  const favorites = await getFavoriteTools();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
      {/* hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your hub</p>
          <h1 className="display-h1">
            Hey {first},{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              {brand.voice.greeting || "let's get to work."}
            </span>
          </h1>
          <p className="mt-3 max-w-md text-muted">
            Your whole speaking world — tools, talks, and the people booking you — in one place that’s
            unmistakably you.
          </p>
        </div>
        <Link href="/analyze" className="btn-primary" style={{ boxShadow: 'var(--shadow-hard)' }}>
          <Plus className="h-4 w-4" /> New talk
        </Link>
      </div>

      {/* tools */}
      <h2 className="eyebrow mb-4 mt-9">Your tools</h2>
      <ToolGrid analysisCount={totalTalks} bookingCount={newInquiries} plan={plan} favorites={favorites} />

      {/* two columns */}
      <div className="mt-9 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-7">
          <section>
            <h2 className="eyebrow mb-3">Recent activity</h2>
            <RecentActivity analyses={recent} />
          </section>
          <section>
            <h2 className="eyebrow mb-3">This season at a glance</h2>
            <StatTiles stats={stats} />
          </section>
        </div>
        <div className="space-y-4">
          <section>
            <h2 className="eyebrow mb-3">Upcoming gigs</h2>
            <UpcomingGigs initialGigs={gigs} initialCalendarUrl={calendarUrl} />
          </section>
          <TipCard tip={buildTip(completed, avg)} />
        </div>
      </div>
    </div>
  );
}
