import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Orator <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';

export async function sendApprovalEmail(to: string, name: string, signupUrl: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "You're approved for Orator",
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">You're in, ${name}.</h1>
        <p style="color:#a1a1aa;margin:0 0 28px;line-height:1.6;">Your access request for Orator has been approved. Click below to create your account — this link expires in 24 hours.</p>
        <a href="${signupUrl}" style="display:inline-block;background:#9333ea;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Create my account →</a>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">Orator · Neural speech analysis</p>
      </div>
    `,
  });
}

export async function sendRejectionEmail(to: string, name: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your Orator access request',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#09090b;color:#fafafa;border-radius:16px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#a855f7,#6366f1);border-radius:10px;margin-bottom:20px;"></div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">Thanks for your interest</h1>
        <p style="color:#a1a1aa;margin:0 0 16px;line-height:1.6;">Hi ${name}, we reviewed your request for access to Orator but are unable to approve it at this time.</p>
        <p style="color:#a1a1aa;margin:0;line-height:1.6;">If you think this was a mistake, you're welcome to submit a new request at <a href="${APP_URL}/request-access" style="color:#a855f7;">${APP_URL}/request-access</a>.</p>
        <p style="color:#3f3f46;font-size:12px;margin-top:32px;">Orator · Neural speech analysis</p>
      </div>
    `,
  });
}
