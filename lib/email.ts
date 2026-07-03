import { Resend } from 'resend';
import { signToken, adminActionsConfigured } from './adminToken';
import { escapeHtml } from './escapeHtml';
import { SITE_URL } from './site';

const FROM = 'ACA <onboarding@resend.dev>';
// Sender for user-facing transactional email (verification codes). Override
// EMAIL_FROM with a verified domain in production — the resend.dev test sender
// only delivers to the Resend account owner, so real signups won't receive it.
const VERIFY_FROM = process.env.EMAIL_FROM ?? 'Speaker Hub <onboarding@resend.dev>';
// Base URL for links inside emails. On Vercel fall back to the canonical site
// URL so approval/rejection links never point at localhost when
// NEXT_PUBLIC_APP_URL is unset; keep localhost only for local dev.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL ? SITE_URL : 'http://localhost:3002');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';

/**
 * Send a 6-digit account-verification code, branded to the Speaker Hub theme.
 * We generate the code ourselves (Supabase admin generateLink) and deliver it
 * through Resend, because Supabase's built-in confirmation email is heavily
 * rate-limited and unreliable in production.
 */
export async function sendVerificationCode(to: string, code: string) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: VERIFY_FROM,
    to,
    subject: `Your verification code: ${code}`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#111114;border:1px solid #e5e5ea;border-radius:16px;">
        <div style="width:40px;height:40px;background:#1A2B50;border-radius:10px;margin-bottom:20px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px;font-family:system-ui;">S</div>
        <h1 style="font-size:20px;font-weight:800;margin:0 0 8px;color:#111114;">Confirm your email</h1>
        <p style="color:#6E6E78;margin:0 0 24px;line-height:1.6;font-size:14px;">Enter this 6-digit code in Speaker Hub to finish creating your account.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1A2B50;background:#F6F6F9;border:1px solid #e5e5ea;border-radius:12px;padding:18px 0;text-align:center;margin-bottom:24px;">${code}</div>
        <p style="color:#9A9AA4;font-size:12px;margin:0;line-height:1.6;">This code expires in 1 hour. If you didn't try to sign up, you can safely ignore this email.</p>
        <p style="color:#C9C9D1;font-size:11px;margin-top:28px;">Speaker Hub</p>
      </div>
    `,
  });
}

export async function sendAccessRequestNotification(
  requestId: string,
  name: string,
  email: string,
  reason: string
) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Escape user-supplied fields — this HTML is built from a public form, so
  // unescaped values would let a stranger inject markup into the admin's email.
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeReason = escapeHtml(reason);

  // One-click approve/deny links need ADMIN_ACTION_SECRET. When it isn't set,
  // still deliver the notification — just point the admin at the panel instead.
  let actionsHtml = `<p style="color:#a1a1aa;font-size:13px;line-height:1.6;">One-click links are disabled (ADMIN_ACTION_SECRET is not set). Review this request in the <a href="${APP_URL}/admin" style="color:#a855f7;">admin panel</a>.</p>`;
  if (adminActionsConfigured()) {
    const approveUrl = `${APP_URL}/api/admin/action?token=${signToken(requestId, 'approve')}`;
    const denyUrl = `${APP_URL}/api/admin/action?token=${signToken(requestId, 'deny')}`;
    actionsHtml = `
        <div style="display:flex;gap:12px;">
          <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">✓ Approve</a>
          <a href="${denyUrl}" style="display:inline-block;background:#3f3f46;color:#fafafa;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">✕ Deny</a>
        </div>`;
  }

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New access request from ${name}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:18px;font-weight:600;margin:0 0 4px;">New Access Request</h1>
        <p style="color:#71717a;font-size:13px;margin:0 0 24px;">Someone wants access to ACA.</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:13px;width:80px;">Name</td>
            <td style="padding:8px 0;color:#fafafa;font-size:13px;font-weight:500;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:13px;">Email</td>
            <td style="padding:8px 0;color:#fafafa;font-size:13px;">${safeEmail}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:13px;vertical-align:top;">Reason</td>
            <td style="padding:8px 0;color:#fafafa;font-size:13px;line-height:1.5;">${safeReason}</td>
          </tr>
        </table>
        ${actionsHtml}
        <p style="color:#3f3f46;font-size:11px;margin-top:28px;">Links expire in 7 days. ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}

export async function sendApprovalEmail(to: string, name: string, signupUrl: string) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You're approved for ACA",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">You're in, ${escapeHtml(name)}.</h1>
        <p style="color:#a1a1aa;margin:0 0 28px;line-height:1.6;">Your access request for ACA has been approved. Click below to create your account — this link expires in 24 hours.</p>
        <a href="${signupUrl}" style="display:inline-block;background:#9333ea;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Create my account →</a>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}

export async function sendRejectionEmail(to: string, name: string) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your ACA access request',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">Thanks for your interest</h1>
        <p style="color:#a1a1aa;margin:0 0 16px;line-height:1.6;">Hi ${escapeHtml(name)}, we reviewed your request for access to ACA but are unable to approve it at this time.</p>
        <p style="color:#a1a1aa;margin:0;line-height:1.6;">If you think this was a mistake, you're welcome to submit a new request at <a href="${APP_URL}/request-access" style="color:#a855f7;">${APP_URL}/request-access</a>.</p>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}
