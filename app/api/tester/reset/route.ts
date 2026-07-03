// Resets the tester demo account back to a brand-new-user state.
//
// The login page calls this right after the tester signs in, so the account is
// wiped clean on every login. It is deliberately locked down:
//   1. It reads the CURRENT session from the server-side Supabase client, so the
//      caller must already be signed in.
//   2. It only proceeds if that session belongs to the tester email — a normal
//      user hitting this endpoint gets a 403 and nothing happens.
//   3. It passes the session's OWN user id to the reset function (never anything
//      from the request body), so it can never be aimed at another account.
// The heavy lifting (deleting rows across every table + resetting the profile)
// lives in the reset_tester_account() SQL function, which only service_role may
// execute — hence the admin client here.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTesterEmail } from '@/lib/tester';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!isTesterEmail(user.email)) {
    // Only the tester account may be reset. Never touch a real user's data.
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('reset_tester_account', { uid: user.id });

  if (error) {
    console.error('Tester reset failed:', error);
    return NextResponse.json({ error: 'Reset failed.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
