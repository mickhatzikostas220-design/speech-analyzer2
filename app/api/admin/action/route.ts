import { createAdminClient } from '@/lib/supabase/admin';
import { verifyToken } from '@/lib/adminToken';
import { sendApprovalEmail, sendRejectionEmail } from '@/lib/email';
import { escapeHtml } from '@/lib/escapeHtml';
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

// Interactive confirmation page. The approve/deny link in the email is a GET, so
// it must NOT change anything — corporate mail scanners (SafeLinks, Proofpoint,
// Gmail prefetch) routinely fetch links in inbound mail, and a GET that mutated
// state would let a scanner silently approve/deny the first pending request. So
// GET only shows this page; the actual decision happens when the admin clicks
// the button, which submits a POST that scanners don't make.
function confirmPage(token: string, action: 'approve' | 'deny', name: string, email: string) {
  const isApprove = action === 'approve';
  const accent = isApprove ? '#16a34a' : '#ef4444';
  const verb = isApprove ? 'Approve' : 'Deny';
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>${verb} access request</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
    .card{max-width:420px;width:100%;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:32px;text-align:center;}
    h1{font-size:18px;font-weight:600;margin-bottom:8px;}p{color:#a1a1aa;font-size:14px;line-height:1.6;margin-bottom:24px;}
    .who{color:#fafafa;font-weight:600;}
    button{width:100%;border:none;border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;color:#fff;background:${accent};cursor:pointer;}
    </style></head><body><div class="card">
    <h1>${verb} this access request?</h1>
    <p>You're about to <strong>${isApprove ? 'approve' : 'deny'}</strong> the request from <span class="who">${escapeHtml(name)}</span> (${escapeHtml(email)}).</p>
    <form method="POST" action="/api/admin/action?token=${encodeURIComponent(token)}">
      <button type="submit">${verb}${isApprove ? ' and send invite' : ''}</button>
    </form>
    </div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

// GET → show a confirmation page (no side effects). POST → perform the action.
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
      `This request from ${escapeHtml(String(req.name ?? ''))} was already ${escapeHtml(String(req.status))}.`,
      '#f59e0b'
    );
  }

  if (payload.action !== 'approve' && payload.action !== 'deny') {
    return htmlPage('Invalid Action', 'Unknown action in token.', '#ef4444');
  }

  return confirmPage(token, payload.action, String(req.name ?? ''), String(req.email ?? ''));
}

export async function POST(request: NextRequest) {
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

  // req.name/req.email come from the public request form — escape them before
  // interpolating into this HTML page (stored-XSS guard).
  const safeName = escapeHtml(String(req.name ?? ''));
  const safeEmail = escapeHtml(String(req.email ?? ''));

  if (req.status !== 'pending') {
    return htmlPage(
      'Already Reviewed',
      `This request from ${safeName} was already ${escapeHtml(String(req.status))}.`,
      '#f59e0b'
    );
  }

  if (payload.action === 'approve') {
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'invite',
      email: req.email,
      options: { redirectTo: `${APP_URL}/auth/callback` },
    });

    if (linkError) return htmlPage('Error', `Failed to generate invite: ${escapeHtml(linkError.message)}`, '#ef4444');

    const signupUrl = linkData.properties?.action_link;
    if (!signupUrl) return htmlPage('Error', 'Failed to generate invite link.', '#ef4444');

    try { await sendApprovalEmail(req.email, req.name, signupUrl); } catch {}

    await adminSupabase.from('access_requests').update({ status: 'approved' }).eq('id', payload.id);

    return htmlPage('Approved', `${safeName} (${safeEmail}) has been approved and sent an invite link.`, '#16a34a');
  }

  if (payload.action === 'deny') {
    try { await sendRejectionEmail(req.email, req.name); } catch {}
    await adminSupabase.from('access_requests').update({ status: 'denied' }).eq('id', payload.id);
    return htmlPage('Denied', `${safeName}'s request has been denied.`, '#3f3f46');
  }

  return htmlPage('Invalid Action', 'Unknown action in token.', '#ef4444');
}
