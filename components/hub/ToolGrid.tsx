import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { planRank, type PlanId } from '@/lib/subscription/plans';
import { TOOLS } from '@/lib/tools/catalog';
import { FavoriteButton } from '@/components/hub/FavoriteButton';

/**
 * The hub's tool grid. Tool metadata comes from the shared catalog
 * (lib/tools/catalog.ts) so the grid and the top-bar pins never drift. Only the
 * dynamic bits — per-tool counts and which tools are favorited — are passed in.
 */
export function ToolGrid({
  analysisCount,
  bookingCount = 0,
  plan = 'free',
  favorites = [],
}: {
  analysisCount: number;
  bookingCount?: number;
  plan?: PlanId;
  /** Keys (from the catalog) of the tools this user has pinned. */
  favorites?: string[];
}) {
  // Live counts, keyed by tool. Everything else is static in the catalog.
  const counts: Record<string, string | undefined> = {
    'speech-analyzer':
      analysisCount > 0 ? `${analysisCount} ${analysisCount === 1 ? 'analysis' : 'analyses'}` : undefined,
    'talk-library':
      analysisCount > 0 ? `${analysisCount} ${analysisCount === 1 ? 'talk' : 'talks'}` : undefined,
    'booking-inbox': bookingCount > 0 ? `${bookingCount} new` : undefined,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map((t) => {
        const count = counts[t.key];
        return (
          <div key={t.key} className="group relative h-full">
            <Link
              href={t.href}
              className="block h-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-soft"
            >
              {/* Decorative "open" cue — moved to the bottom corner so the
                  favorite star can own the conventional top-right slot. */}
              <ArrowUpRight className="pointer-events-none absolute bottom-5 right-5 h-5 w-5 text-[var(--ink-300)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ink-900)]" />
              <span
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
                style={{ background: t.bg, color: t.fg }}
              >
                <t.icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <div className="flex items-center gap-2 pr-8">
                <h3 className="text-lg font-extrabold text-strong">{t.name}</h3>
                {t.tier && planRank(t.tier) > planRank(plan) && (
                  <span className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-faint">
                    {t.tier === 'full' ? 'Full' : 'Core'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{t.desc}</p>
              {count && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                  {count}
                </div>
              )}
            </Link>
            {/* Sibling of the Link (not nested) so we never place a button
                inside an anchor. z-10 keeps the star clickable above the card. */}
            <div className="absolute right-3 top-3 z-10">
              <FavoriteButton
                toolKey={t.key}
                toolName={t.name}
                initialFavorited={favorites.includes(t.key)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
