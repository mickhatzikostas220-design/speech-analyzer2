import { createAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from '@/lib/adminToken';
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email';
import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';

function htmlPage(title: string, message: string, color: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
    .card{max-width:420px;width:100%;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;text-align:center;}
    .dot{width:48px;height:48px;border-radius:12px;background:${color};margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:22px;}
    h1{font-size:18px;font-weight:600;margin-bottom:8px;}p{color:#71717a;font-size:14px;line-height:1.6;}</style>
    </head><body><div class="card"><div class="dot">${color === '#16a34a' ? '✓' : '✕'}</div>
    <h1>${title}</h1><p>${message}</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return htmlPage('Invalid Link', 'This link is missing a token.', '#ef4444');

  const payload = verifyToken(token);
  if (!payload) return htmlPage('Link Expired', 'This link has expired or is invalid. Log in to the admin panel to review requests.', '#ef4444');

  const adminSupabase = createAdminClient();
  const { data: req } = await adminSupabase
    .from('access_requests')
    .select('*')
    .eq('id', payload.id)
    .single();

  if (!req) return htmlPage('Not Found', 'This access request no longer exists.', '#ef4444');
  if (req.status !== 'pending') {
    return htmlPage(
      'Already Reviewed',
      `This request from ${req.name} was already ${req.status}.`,
      '#f59e0b'
    );
  }

  if (payload.action === 'approve') {
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'invite',
      email: req.email,
      options: { redirectTo: `${APP_URL}/auth/callback` },
    });

    if (linkError) return htmlPage('Error', `Failed to generate invite: ${linkError.message}`, '#ef4444');

    const signupUrl = linkData.properties?.action_link;
    if (!signupUrl) return htmlPage('Error', 'Failed to generate invite link.', '#ef4444');

    try { await sendApprovalEmail(req.email, req.name, signupUrl); } catch {}

    await adminSupabase.from('access_requests').update({ status: 'approved' }).eq('id', payload.id);

    return htmlPage('Approved', `${req.name} (${req.email}) has been approved and sent an invite link.`, '#16a34a');
  }

  if (payload.action === 'deny') {
    try { await sendRejectionEmail(req.email, req.name); } catch {}
    await adminSupabase.from('access_requests').update({ status: 'denied' }).eq('id', payload.id);
    return htmlPage('Denied', `${req.name}'s request has been denied.`, '#3f3f46');
  }

  return htmlPage('Invalid Action', 'Unknown action in token.', '#ef4444');
}
