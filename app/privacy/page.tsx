// Public Privacy Policy page (/privacy). Explains what data Speaker Hub
// collects, why, and how it is handled. Linked from the landing page footer
// and required before charging real customers.
//
// NOTE for Mick: this is a solid, honest baseline written to match how the app
// actually works (Supabase auth/storage, OpenAI/Anthropic for AI, Stripe for
// payments, Resend for email). The operator and contact email are now set;
// still have it reviewed by counsel before you rely on it in production.

import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/marketing/LegalPage';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE_NAME} collects, uses, and protects your data.`,
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'mickhatzikostas220@gmail.com';

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
    heading: 'How we share information',
    paragraphs: [
      'We share information only with the service providers that make the product work — for example authentication and database hosting (Supabase), AI processing (OpenAI, Anthropic), payments (Stripe), and email delivery (Resend) — and only to the extent needed to provide the service.',
      'We may disclose information if required by law, to protect our rights, or as part of a business transfer such as a merger or acquisition. We do not sell your personal information.',
    ],
  },
  {
    heading: 'Cookies and similar technologies',
    paragraphs: [
      'We use strictly necessary, first-party cookies to keep you signed in and to keep the service secure — for example, the session cookies set by our authentication provider (Supabase). These are required for the app to function and cannot be turned off from within the app.',
      'We do not use advertising cookies, and we do not sell or share your information with advertising networks. If we add optional analytics or other non-essential cookies in the future, we will update this policy and, where the law requires it, ask for your consent first.',
      'Most browsers let you block or delete cookies in their settings. Blocking strictly necessary cookies may stop you from signing in or using parts of the service.',
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      'The service is intended for adults and is not directed to children. We do not knowingly collect personal information from anyone under 16 (or under 13 in the United States).',
      'If you believe a child has provided us with personal information, contact us at the address below and we will delete it.',
    ],
  },
  {
    heading: 'International data transfers',
    paragraphs: [
      'We and our service providers may process and store your information in countries other than the one you live in, including the United States. Where required, we rely on appropriate safeguards for these transfers.',
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
      updated="July 1, 2026"
      intro={`${SITE_NAME} is operated by Michael Hatzikostas, based in Connecticut, United States. This Privacy Policy explains what information ${SITE_NAME} collects, how we use it, and the choices you have. By using the service, you agree to the practices described here.`}
      sections={sections}
    />
  );
}
