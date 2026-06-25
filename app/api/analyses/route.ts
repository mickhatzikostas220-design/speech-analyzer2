import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserBilling, incrementAnalysisCount } from '@/lib/billing/server';
import { formatBytes } from '@/lib/billing/plans';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Look up the true byte size of an uploaded storage object (admin read). */
async function getStorageObjectSize(filePath: string): Promise<number | null> {
  const slash = filePath.lastIndexOf('/');
  const folder = slash >= 0 ? filePath.slice(0, slash) : '';
  const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  try {
    const admin = createAdminClient();
    const { data } = await admin.storage.from('speeches').list(folder, { search: name });
    const match = data?.find((o) => o.name === name);
    const size = (match?.metadata as { size?: number } | undefined)?.size;
    return typeof size === 'number' ? size : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { title, file_path, file_type, duration_seconds } = body;

  if (!title || !file_path || !file_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // ── Plan enforcement ───────────────────────────────────────────────────────
  const billing = await getUserBilling(supabase, user.id);
  const plan = billing.planConfig;

  // 1) Monthly analysis quota (free plan only; premium is unlimited).
  if (plan.monthlyAnalysisLimit !== null && billing.analysisCount >= plan.monthlyAnalysisLimit) {
    // Remove the just-uploaded file so we don't leave orphaned storage objects.
    await supabase.storage.from('speeches').remove([file_path]).catch(() => {});
    return NextResponse.json(
      {
        error: `You've used all ${plan.monthlyAnalysisLimit} of your free analyses this month.`,
        code: 'limit_reached',
        upgrade: true,
      },
      { status: 402 }
    );
  }

  // 2) Upload size cap for the plan (verified against the real stored object).
  const size = await getStorageObjectSize(file_path);
  if (size !== null && size > plan.maxUploadBytes) {
    await supabase.storage.from('speeches').remove([file_path]).catch(() => {});
    return NextResponse.json(
      {
        error: `That file is ${formatBytes(size)}. Your ${plan.name} plan allows uploads up to ${formatBytes(
          plan.maxUploadBytes
        )}.`,
        code: 'file_too_large',
        upgrade: true,
      },
      { status: 413 }
    );
  }

  const { data, error } = await supabase
    .from('analyses')
    .insert({ user_id: user.id, title, file_path, file_type, duration_seconds, status: 'pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count this analysis against the user's monthly usage.
  await incrementAnalysisCount(user.id, billing.analysisCount);

  return NextResponse.json({ id: data.id }, { status: 201 });
}
