// Admin endpoint — grant a specific plan tier to any user by email.
// Only the admin (ADMIN_EMAIL) can call this. Uses the service-role client so
// it can write to the billing-protected plan column on profiles.
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import type { PlanId } from '@/lib/subscription/plans';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';
const VALID_PLANS: PlanId[] = ['free', 'core', 'full'];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: unknown; plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  const plan = typeof body.plan === 'string' ? body.plan as PlanId : null;

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });
  if (!plan || !VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'plan must be free, core, or full' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  // Look up the user by email in auth.users
  const { data: listData, error: listError } = await adminSupabase.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const authUser = listData.users.find((u) => u.email?.toLowerCase() === email);

  if (!authUser) {
    // User doesn't have an account yet — invite them so they can sign up,
    // then upsert a profile row with the requested plan so it takes effect
    // as soon as they complete sign-up (the handle_new_user trigger will
    // on-conflict-do-nothing, keeping the plan we set here).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${appUrl}/auth/callback` },
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    const newUserId = linkData.user?.id;
    if (newUserId) {
      // Pre-create the profile row with the plan; the signup trigger will
      // do on conflict do nothing, so this plan value persists.
      await adminSupabase.from('profiles').upsert(
        { id: newUserId, email, plan },
        { onConflict: 'id' }
      );
    }

    return NextResponse.json({
      success: true,
      invited: true,
      inviteLink: linkData.properties?.action_link ?? null,
      plan,
    });
  }

  // User exists — update their profile plan directly via service role.
  const { error: updateError } = await adminSupabase
    .from('profiles')
    .upsert({ id: authUser.id, email, plan }, { onConflict: 'id' });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, invited: false, plan });
}
