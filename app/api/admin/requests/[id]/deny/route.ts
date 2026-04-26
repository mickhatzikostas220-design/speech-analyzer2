import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendRejectionEmail } from '@/lib/email';
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

  // Send rejection email (optional — skipped if RESEND_API_KEY not set)
  if (process.env.RESEND_API_KEY) {
    try {
      await sendRejectionEmail(req.email, req.name);
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }
  }

  await adminSupabase
    .from('access_requests')
    .update({ status: 'denied' })
    .eq('id', params.id);

  return NextResponse.json({ success: true });
}
