// Public Privacy Policy page (/privacy). Explains what data Speaker Hub
// collects, why, and how it is handled. Linked from the landing page footer
// and required before charging real customers.
//
// NOTE for Mick: this is a solid, honest baseline written to match how the app
// actually works (Supabase auth/storage, OpenAI/Anthropic for AI, Stripe for
// payments, Resend for email). Have it reviewed by counsel and set your real
// contact email before you rely on it in production.

import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/marketing/LegalPage';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE_NAME} collects, uses, and protects your data.`,
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'privacy@speaker-hub.com';

const sections: LegalSection[] = [
  {
    heading: 'Information we collect',
    paragraphs: [
      'Account information: when you sign up, we collect your name, email address, and password credentials (stored securely by our authentication provider). If you personalize your hub, we also store the brand details you provide, such as colors, logo, and voice.',
      'Content you upload: talks, recordings, transcripts, scripts, one-sheets, and any other material you add to the app so that our tools can analyze and improve it for you.',
      'Usage information: basic technical data such as device and browser type, pages visited, and actions taken, which helps us keep the service reliable and understand which features are useful.',
      'Payment information: if you subscribe to a paid plan, payments are processed by Stripe. We do not store your full card number — Stripe handles that directly under its own security standards.',
    ],
  },
  {
    heading: 'How we use your information',
    paragraphs: [
      'To provide the service: transcribe and analyze your talks, generate coaching feedback, power your booking inbox and assistant, and keep your hub styled to your brand.',
      'To improve the product: understand which tools help speakers most, fix bugs, and prioritize new features.',
      'To communicate with you: send account, security, billing, and product updates. You can opt out of non-essential email at any time.',
    ],
  },
  {
    heading: 'AI processing',
    paragraphs: [
      'Some features send your content to trusted AI providers (such as OpenAI and Anthropic) to transcribe audio and generate analysis, suggestions, and drafts. This processing happens only to deliver the feature you requested.',
      'We do not sell your content, and we do not use it to train our own advertising profiles. AI providers process the content under their own terms and applicable data-processing agreements.',
    ],
  },
  {
    heading: 'Connected social accounts',
    paragraphs: [
      'If you connect a social account (such as X, YouTube, TikTok, Instagram, Facebook, or LinkedIn) to publish clips, we receive and securely store the access tokens those platforms issue so we can post on your behalf at your request. We request only the permissions needed to publish the content you choose. To deliver clips to some platforms we use a third-party publishing provider (Upload-Post), which transmits the clip and the connected-account credentials needed to complete the post.',
      'You can disconnect a linked account at any time, which revokes our stored access. Each connected platform also handles your data under its own privacy policy and terms.',
    ],
  },
  {
    heading: 'Connected Google account (AI Assistant)',
    paragraphs: [
      'If you connect a Google account to power the AI Assistant, you grant access to your Gmail messages and Google Calendar events so the Assistant can help you read, draft, and manage speaking-related correspondence and scheduling. With your instruction, the Assistant may also draft and send email on your behalf from your connected account.',
      'We access this data only to provide the Assistant features you use, and we securely store the encrypted access and refresh tokens Google issues. We do not sell this data or use it for advertising. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.',
      'You can disconnect your Google account at any time from the app, which revokes our stored access. Google processes your data under its own privacy policy and terms.',
    ],
  },
  {
    heading: 'Booking inquiries from event organizers',
    paragraphs: [
      'The public booking and one-sheet tools let event organizers send you an inquiry. When they do, we collect and store the details they submit — such as their name, email, organization, event name, date, location, and message — and deliver them to the speaker who owns that page. If you are an organizer submitting an inquiry, you are sharing this information so the speaker can respond to you; the speaker, not Speaker Hub, is the recipient and controller of that message.',
    ],
  },
  {
    heading: 'Personalization',
    paragraphs: [
      'To make the tools more useful, we may remember preferences and details you share across the app so that features stay consistent and tailored to you. You can view, change, or clear this information from your account.',
    ],
  },
  {
    heading: 'How we share information',
    paragraphs: [
      'We share information only with the service providers that make the product work — for example authentication and database hosting (Supabase), AI processing (OpenAI, Anthropic), payments (Stripe), email delivery (Resend), social publishing infrastructure (Upload-Post), the Google account you optionally connect for the AI Assistant, and any social platforms you choose to connect (to publish the content you ask us to) — and only to the extent needed to provide the service.',
      'We may disclose information if required by law, to protect our rights, or as part of a business transfer such as a merger or acquisition. We do not sell your personal information.',
    ],
  },
  {
    heading: 'Donations',
    paragraphs: [
      'If you choose to make a voluntary donation to support Speaker Hub, your payment is processed by Stripe, the same processor we use for subscriptions. We receive confirmation of the donation and limited details (such as the amount and, if you provide it, your email), but we never see or store your full card number.',
      'If you donate through a third-party platform we link to, that platform collects and processes your payment under its own privacy policy and terms. Donations are optional and are never required to use the Service.',
    ],
  },
  {
    heading: 'Data retention and security',
    paragraphs: [
      'We keep your information for as long as your account is active or as needed to provide the service. You can delete your content, and you may request deletion of your account and associated data.',
      'We use industry-standard safeguards, including encryption in transit, to protect your information. No method of transmission or storage is completely secure, but we work to protect your data and limit access to it.',
    ],
  },
  {
    heading: 'Your rights and choices',
    paragraphs: [
      'Depending on where you live, you may have the right to access, correct, export, or delete your personal information, and to object to or restrict certain processing.',
      `To exercise these rights, or if you have any questions about this policy, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'We may update this policy from time to time. When we make material changes, we will update the date at the top of this page and, where appropriate, notify you in the app or by email.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 6, 2026"
      intro={`This Privacy Policy explains what information ${SITE_NAME} collects, how we use it, and the choices you have. By using the service, you agree to the practices described here.`}
      sections={sections}
    />
  );
}
