import { Resend } from 'resend';
import { signToken } from './adminToken';

const FROM = 'ACA <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';

export async function sendAccessRequestNotification(
  requestId: string,
  name: string,
  email: string,
  reason: string
) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const approveToken = signToken(requestId, 'approve');
  const denyToken    = signToken(requestId, 'deny');
  const approveUrl   = `${APP_URL}/api/admin/action?token=${approveToken}`;
  const denyUrl      = `${APP_URL}/api/admin/action?token=${denyToken}`;

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
            <td style="padding:8px 0;color:#fafafa;font-size:13px;font-weight:500;">${name}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:13px;">Email</td>
            <td style="padding:8px 0;color:#fafafa;font-size:13px;">${email}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#71717a;font-size:13px;vertical-align:top;">Reason</td>
            <td style="padding:8px 0;color:#fafafa;font-size:13px;line-height:1.5;">${reason}</td>
          </tr>
        </table>

        <div style="display:flex;gap:12px;">
          <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">✓ Approve</a>
          <a href="${denyUrl}" style="display:inline-block;background:#3f3f46;color:#fafafa;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">✕ Deny</a>
        </div>

        <p style="color:#3f3f46;font-size:11px;margin-top:28px;">Links expire in 7 days. ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}

export async function sendApprovalEmail(to: string, name: string, signupUrl: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You're approved for ACA",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">You're in, ${name}.</h1>
        <p style="color:#a1a1aa;margin:0 0 28px;line-height:1.6;">Your access request for ACA has been approved. Click below to create your account — this link expires in 24 hours.</p>
        <a href="${signupUrl}" style="display:inline-block;background:#9333ea;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Create my account →</a>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}

export async function sendRejectionEmail(to: string, name: string) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your ACA access request',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">Thanks for your interest</h1>
        <p style="color:#a1a1aa;margin:0 0 16px;line-height:1.6;">Hi ${name}, we reviewed your request for access to ACA but are unable to approve it at this time.</p>
        <p style="color:#a1a1aa;margin:0;line-height:1.6;">If you think this was a mistake, you're welcome to submit a new request at <a href="${APP_URL}/request-access" style="color:#a855f7;">${APP_URL}/request-access</a>.</p>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">ACA · Neural Speech Analysis</p>
      </div>
    `,
  });
}
