// Public Cookie Policy page (/cookies). Explains, honestly and specifically,
// which cookies and browser-storage technologies Speaker Hub uses and why.
// Linked from the cookie-consent banner and the site/legal footers.
//
// NOTE for Mick: this matches how the app actually works today — Supabase sets
// auth/session cookies to keep users signed in, we store a few functional items
// in the browser (the consent choice, the most recent SEO tips, UI preferences),
// and we do NOT run third-party advertising or cross-site tracking. If you ever
// add analytics or ad tools, this page (and the banner) must be updated to match,
// and you should have counsel review it before relying on it in production.

import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/marketing/LegalPage';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: `How ${SITE_NAME} uses cookies and similar technologies.`,
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'privacy@speaker-hub.com';

const sections: LegalSection[] = [
  {
    heading: 'What cookies and similar technologies are',
    paragraphs: [
      'Cookies are small text files a website stores on your device. "Similar technologies" include your browser’s local storage, which lets a site remember information between visits. We use both, sparingly, to make Speaker Hub work and to remember your preferences.',
      'This policy explains the specific things we store, why we store them, and how you can control them. It should be read together with our Privacy Policy.',
    ],
  },
  {
    heading: 'Strictly necessary cookies',
    paragraphs: [
      'These are required for the app to function and cannot be switched off. When you sign in, our authentication provider (Supabase) sets secure session cookies that keep you logged in and protect your account between pages. Without them you could not sign in or use the tools.',
      'We also set a single first-party cookie (named "cookie_consent") to remember the choice you make in the cookie banner, so we don’t ask you again on every visit.',
    ],
  },
  {
    heading: 'Functional storage and preferences',
    paragraphs: [
      'To make the tools nicer to use, we keep a few things in your browser’s local storage, on your device. Examples include your cookie choice, the most recent SEO/AEO tips you generated (so they’re still there when you come back to the tool), and interface preferences.',
      'This information stays in your browser and is not used to track you across other websites.',
    ],
  },
  {
    heading: 'Analytics and advertising',
    paragraphs: [
      'We do not use third-party advertising cookies, and we do not use cross-site or cross-app tracking to build advertising profiles.',
      'The providers that host and secure the service (such as our hosting platform Vercel and our backend provider Supabase) may set minimal operational cookies that are necessary to deliver the site reliably and safely.',
    ],
  },
  {
    heading: 'Third-party and connected services',
    paragraphs: [
      'If you connect a social platform to publish clips (for example YouTube, TikTok, Instagram, Facebook, or LinkedIn) or make a payment or donation (processed by Stripe), those providers may set their own cookies under their own policies when you interact with them. We don’t control those cookies; please review each provider’s policy for details.',
    ],
  },
  {
    heading: 'Managing your cookies',
    paragraphs: [
      'You can accept all cookies or choose "Necessary only" in the banner shown on your first visit. You can also control or delete cookies at any time through your browser settings, and clear this site’s local storage from your browser.',
      'Blocking or deleting strictly necessary cookies will sign you out and prevent core features from working, because we use them to keep your session secure.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'We may update this Cookie Policy as the product changes. When we make material changes we will update the date at the top of this page and, where appropriate, ask for your choice again.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `If you have questions about how we use cookies, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="July 6, 2026"
      intro={`This Cookie Policy explains how ${SITE_NAME} uses cookies and similar technologies, and the choices you have.`}
      sections={sections}
    />
  );
}
