import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { sendAccessRequestNotification } from '@/lib/email';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, reason } = body;

  if (!name?.trim() || !email?.trim() || !reason?.trim()) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: existing } = await adminSupabase
    .from('access_requests')
    .select('status')
    .eq('email', email.toLowerCase().trim())
    .in('status', ['pending', 'approved'])
    .maybeSingle();

  if (existing?.status === 'approved') {
    return NextResponse.json({ error: 'This email has already been approved. Check your inbox for an invite link.' }, { status: 409 });
  }
  if (existing?.status === 'pending') {
    return NextResponse.json({ error: 'A request from this email is already pending review.' }, { status: 409 });
  }

  const { data: inserted, error } = await adminSupabase
    .from('access_requests')
    .insert({ name: name.trim(), email: email.toLowerCase().trim(), reason: reason.trim() })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  if (process.env.RESEND_API_KEY) {
    try {
      await sendAccessRequestNotification(inserted.id, name.trim(), email.toLowerCase().trim(), reason.trim());
    } catch (emailErr) {
      console.error('Admin notification email failed:', emailErr);
    }
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
