import type { SupabaseClient } from '@supabase/supabase-js';
import { AEO_CATALOG, CATALOG_KEYS, getTipContent } from './catalog';
import { billingConfigured } from '@/lib/billing/stripe';
import type { AeoState, Cadence, Plan, Track, UserTip } from './types';

const DAY = 24 * 60 * 60 * 1000;
const INTERVAL_MS: Record<Cadence, number> = {
  daily: DAY,
  weekly: 7 * DAY,
  biweekly: 14 * DAY,
  monthly: 30 * DAY,
};

interface TipRow {
  id: string;
  tip_key: string;
  status: 'active' | 'completed' | 'skipped';
  track: Track | null;
  released_at: string;
  completed_at: string | null;
}

export async function getPlan(supabase: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await supabase.from('profiles').select('plan').eq('id', userId).maybeSingle();
  return (data?.plan as Plan) ?? 'free';
}

async function getSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ cadence: Cadence; last_released_at: string | null }> {
  const { data } = await supabase
    .from('aeo_settings')
    .select('cadence, last_released_at')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    cadence: (data?.cadence as Cadence) ?? 'weekly',
    last_released_at: (data?.last_released_at as string) ?? null,
  };
}

// Free users are always on a weekly cadence; pro users use their chosen one.
function effectiveCadence(plan: Plan, cadence: Cadence): Cadence {
  return plan === 'free' ? 'weekly' : cadence;
}

function nextCatalogKey(releasedKeys: Set<string>): string | null {
  return CATALOG_KEYS.find((k) => !releasedKeys.has(k)) ?? null;
}

function toUserTips(rows: TipRow[]): UserTip[] {
  return rows
    .map((r) => {
      const content = getTipContent(r.tip_key);
      if (!content) return null;
      return { ...r, content } as UserTip;
    })
    .filter((t): t is UserTip => t !== null);
}

async function recordRelease(
  supabase: SupabaseClient,
  userId: string,
  tipKey: string,
  now: string
): Promise<void> {
  await supabase.from('aeo_tips').insert({ user_id: userId, tip_key: tipKey, released_at: now });
  await supabase
    .from('aeo_settings')
    .upsert(
      { user_id: userId, last_released_at: now, updated_at: now },
      { onConflict: 'user_id' }
    );
}

/**
 * Load the user's AEO state, auto-releasing the next tip if their cadence is due.
 * Defensive: if the AEO tables aren't migrated yet, returns an empty free state
 * rather than throwing.
 */
export async function getAeoState(supabase: SupabaseClient, userId: string): Promise<AeoState> {
  const empty: AeoState = {
    plan: 'free',
    cadence: 'weekly',
    tips: [],
    canRelease: true,
    nextAvailableAt: null,
    exhausted: false,
    totalCatalog: AEO_CATALOG.length,
    billingConfigured: billingConfigured(),
  };

  try {
    const [plan, settings, { data: tipRows }] = await Promise.all([
      getPlan(supabase, userId),
      getSettings(supabase, userId),
      supabase
        .from('aeo_tips')
        .select('id, tip_key, status, track, released_at, completed_at')
        .eq('user_id', userId)
        .order('released_at', { ascending: false }),
    ]);

    let rows = (tipRows as TipRow[]) ?? [];
    const releasedKeys = new Set(rows.map((r) => r.tip_key));
    const cadence = effectiveCadence(plan, settings.cadence);
    const interval = INTERVAL_MS[cadence];
    const last = settings.last_released_at ? new Date(settings.last_released_at).getTime() : 0;
    const now = Date.now();
    const due = !last || now - last >= interval;
    let exhausted = releasedKeys.size >= CATALOG_KEYS.length;

    // Auto-release the next tip when the cadence window has elapsed.
    if (due && !exhausted) {
      const nextKey = nextCatalogKey(releasedKeys);
      if (nextKey) {
        const iso = new Date(now).toISOString();
        await recordRelease(supabase, userId, nextKey, iso);
        rows = [
          { id: 'pending', tip_key: nextKey, status: 'active', track: null, released_at: iso, completed_at: null },
          ...rows,
        ];
        releasedKeys.add(nextKey);
        settings.last_released_at = iso;
        exhausted = releasedKeys.size >= CATALOG_KEYS.length;
        // Re-read to get the real id for the freshly inserted row.
        const { data: refreshed } = await supabase
          .from('aeo_tips')
          .select('id, tip_key, status, track, released_at, completed_at')
          .eq('user_id', userId)
          .order('released_at', { ascending: false });
        if (refreshed) rows = refreshed as TipRow[];
      }
    }

    const lastAfter = settings.last_released_at ? new Date(settings.last_released_at).getTime() : 0;
    const canRelease = !exhausted && (plan === 'pro' || !lastAfter || now - lastAfter >= interval);
    const nextAvailableAt =
      exhausted || plan === 'pro' || canRelease || !lastAfter
        ? null
        : new Date(lastAfter + interval).toISOString();

    return {
      plan,
      cadence: settings.cadence,
      tips: toUserTips(rows),
      canRelease,
      nextAvailableAt,
      exhausted,
      totalCatalog: AEO_CATALOG.length,
      billingConfigured: billingConfigured(),
    };
  } catch {
    return empty;
  }
}

/**
 * Manually release the next tip now. Pro users are unlimited; free users are
 * gated to one per week. Returns { ok, error?, nextAvailableAt? }.
 */
export async function releaseNextTip(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: boolean; error?: string; nextAvailableAt?: string | null }> {
  const plan = await getPlan(supabase, userId);
  const settings = await getSettings(supabase, userId);

  const { data: tipRows } = await supabase
    .from('aeo_tips')
    .select('tip_key')
    .eq('user_id', userId);
  const releasedKeys = new Set(((tipRows as { tip_key: string }[]) ?? []).map((r) => r.tip_key));

  if (releasedKeys.size >= CATALOG_KEYS.length) {
    return { ok: false, error: 'You’ve unlocked every tip in the playbook. Nice work.' };
  }

  if (plan === 'free') {
    const interval = INTERVAL_MS.weekly;
    const last = settings.last_released_at ? new Date(settings.last_released_at).getTime() : 0;
    if (last && Date.now() - last < interval) {
      const nextAvailableAt = new Date(last + interval).toISOString();
      return {
        ok: false,
        error: 'Free plan gets one tip a week. Upgrade to Pro for unlimited tips on your own schedule.',
        nextAvailableAt,
      };
    }
  }

  const nextKey = nextCatalogKey(releasedKeys);
  if (!nextKey) return { ok: false, error: 'No more tips to release.' };

  await recordRelease(supabase, userId, nextKey, new Date().toISOString());
  return { ok: true };
}
