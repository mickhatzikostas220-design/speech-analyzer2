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
      'Tool results and history: to keep the tools useful across visits and devices, we save the results they generate for you — for example your SEO/AEO tips, content ideas, and stage lists — to your account, and keep a limited recent history you can return to.',
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
      "The Speech Analyzer works a little differently. When you analyze a talk, your recording is transcribed by an open speech-to-text model (NVIDIA's Parakeet, or OpenAI's Whisper as a fallback) and then run through TRIBE v2, an open research model from Meta that predicts how a listener's brain is likely to respond. These models run on third-party GPU infrastructure (Modal), which processes your recording only to produce your report. The results are model estimates meant to help you rehearse — not measured brain activity, and not medical information.",
      'We do not sell your content, and we do not use it to train our own advertising profiles. AI providers process the content under their own terms and applicable data-processing agreements.',
    ],
  },
  {
    heading: 'Connected social accounts',
    paragraphs: [
      'If you connect a social account (such as X, YouTube, TikTok, Instagram, Facebook, or LinkedIn) to publish clips, we receive and securely store the access tokens those platforms issue so we can post on your behalf at your request. We request only the permissions needed to publish the content you choose.',
      'You can disconnect a linked account at any time, which revokes our stored access. Each connected platform also handles your data under its own privacy policy and terms.',
    ],
  },
  {
    heading: 'Connected Google account (Assistant)',
    paragraphs: [
      'If you connect your Google account to the Assistant, you grant it read access to your Gmail and Google Calendar and the ability to draft and send email on your behalf. We use that access only to carry out the actions you ask the Assistant to take — for example, reading a message you point it at, checking your schedule, or sending a reply you approve.',
      'We securely store the access tokens Google issues (encrypted at rest) and never store your Google password. Your email and calendar content is processed to fulfill your request and is not used to build advertising profiles or to train our own models. Depending on the autonomy level you choose, the Assistant will either draft actions for your confirmation or carry them out directly — you control this in settings.',
      'You can disconnect Google at any time from your settings, which removes our stored tokens, and you can also revoke access from your Google Account security settings. Our use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.',
    ],
  },
  {
    heading: 'Personalization',
    paragraphs: [
      'To make the tools more useful, we may remember preferences and details you share across the app — such as your goals, speaking topics, and your website — so that features stay consistent and tailored to you. This memory powers personalized results across the app, including the SEO tips we generate for your site. You can view, change, or clear this information, or turn memory off entirely, from your account settings.',
    ],
  },
  {
    heading: 'Public speaker pages (one-sheets)',
    paragraphs: [
      "If you publish a one-sheet, it's hosted at a public web address (for example speaker-hub.com/s/your-name) that anyone with the link can open — that's the whole point of it, so event organizers can find and book you. Because the page is public, search engines and AI answer engines can crawl, index, and cite it, and we include published one-sheets in our sitemap to help them find it. Only the details you choose to put on your one-sheet appear there.",
      "Having a public one-sheet is your choice. You can change or remove it at any time from your settings; once it's removed the page stops loading, and search engines drop it from their results over time.",
    ],
  },
  {
    heading: 'Cookies and similar technologies',
    paragraphs: [
      'We use strictly necessary cookies to keep you signed in and secure your session, and we store a few functional items in your browser (such as your cookie choice and your most recent tips) to make the tools easier to use. We do not use third-party advertising or cross-site tracking cookies.',
      'You can accept or decline non-essential cookies when you first visit, and manage cookies through your browser at any time. For full details, see our Cookie Policy.',
    ],
  },
  {
    heading: 'How we share information',
    paragraphs: [
      'We share information only with the service providers that make the product work — for example authentication and database hosting (Supabase), AI processing (OpenAI and Anthropic, plus the open Speech Analyzer models from Meta and NVIDIA, which run on Modal GPU infrastructure), payments (Stripe), email delivery (Resend), the Google account you may connect to the Assistant (Gmail and Calendar, used only to carry out the actions you request), and any social platforms you choose to connect (to publish the content you ask us to) — and only to the extent needed to provide the service.',
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
      updated="July 15, 2026"
      intro={`This Privacy Policy explains what information ${SITE_NAME} collects, how we use it, and the choices you have. By using the service, you agree to the practices described here.`}
      sections={sections}
    />
  );
}
