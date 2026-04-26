import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendApprovalEmail } from '@/lib/email';
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();

  const { data: req } = await adminSupabase
    .from('access_requests')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'Request already reviewed' }, { status: 409 });
  }

  // Generate an invite link via Supabase Auth Admin
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email: req.email,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const signupUrl = linkData.properties?.action_link;
  if (!signupUrl) {
    return NextResponse.json({ error: 'Failed to generate invite link' }, { status: 500 });
  }

  // Send approval email via Resend (optional — skipped if RESEND_API_KEY not set)
  let emailSent = false;
  if (process.env.RESEND_API_KEY) {
    try {
      await sendApprovalEmail(req.email, req.name, signupUrl);
      emailSent = true;
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }
  }

  // Mark as approved
  await adminSupabase
    .from('access_requests')
    .update({ status: 'approved' })
    .eq('id', params.id);

  // Return signup URL so admin can manually share it if email is not configured
  return NextResponse.json({ success: true, emailSent, signupUrl });
}
