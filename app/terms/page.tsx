// Public Terms of Service page (/terms). The agreement between Speaker Hub and
// the people who use it. Linked from the landing page footer and required
// before charging real customers.
//
// NOTE for Mick: this is a solid, honest baseline that matches the app's plans
// and features. Have it reviewed by counsel, set your governing-law location,
// and set your real contact email before you rely on it in production.

import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/marketing/LegalPage';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms that govern your use of ${SITE_NAME}.`,
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'support@speakerhub.app';

const sections: LegalSection[] = [
  {
    heading: 'Acceptance of terms',
    paragraphs: [
      `By creating an account or using ${SITE_NAME} (the "Service"), you agree to these Terms of Service. If you do not agree, please do not use the Service.`,
      'You must be at least 18 years old, or the age of majority where you live, to use the Service.',
    ],
  },
  {
    heading: 'Your account',
    paragraphs: [
      'You are responsible for keeping your login credentials secure and for all activity that happens under your account. Let us know right away if you suspect any unauthorized use.',
      'You agree to provide accurate information and to keep it up to date.',
    ],
  },
  {
    heading: 'Plans and billing',
    paragraphs: [
      'The Service offers a Free plan and paid plans (Core Premium and Full Premium). Paid plans are billed monthly in advance through our payment processor, Stripe.',
      'Subscriptions renew automatically each billing period until you cancel. You can cancel anytime from your account settings; your plan remains active through the end of the current paid period.',
      'Except where required by law, payments are non-refundable. We may change plan pricing or features, and if we do, we will give you reasonable notice.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You retain ownership of the talks, recordings, scripts, and other content you upload ("Your Content"). You grant us a limited license to store, process, and display Your Content solely to operate and provide the Service to you — including sending it to AI providers to generate transcriptions and analysis at your request.',
      'You are responsible for Your Content and for having the rights needed to upload it. Do not upload anything unlawful, infringing, or that violates the rights or privacy of others.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'You agree not to misuse the Service, including by attempting to disrupt or reverse-engineer it, accessing it in unauthorized ways, uploading malware, or using it to violate any law or the rights of others.',
      'We may suspend or terminate accounts that violate these terms or that create risk or harm for the Service or other users.',
    ],
  },
  {
    heading: 'AI-generated content',
    paragraphs: [
      'Speaker Hub uses AI to produce transcriptions, analysis, suggestions, and drafts. These outputs can be imperfect or inaccurate and are provided to assist you, not to replace your own judgment. You are responsible for reviewing anything you rely on or publish.',
    ],
  },
  {
    heading: 'Disclaimers and limitation of liability',
    paragraphs: [
      'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied, to the fullest extent permitted by law.',
      'To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages, and our total liability for any claim relating to the Service is limited to the amount you paid us in the twelve months before the claim.',
    ],
  },
  {
    heading: 'Termination',
    paragraphs: [
      'You may stop using the Service and delete your account at any time. We may suspend or end your access if you violate these terms or if we discontinue the Service.',
    ],
  },
  {
    heading: 'Changes and contact',
    paragraphs: [
      'We may update these terms from time to time. When we make material changes, we will update the date at the top of this page and, where appropriate, notify you in the app.',
      `If you have questions about these terms, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 1, 2026"
      intro={`Please read these terms carefully. They govern your access to and use of ${SITE_NAME}.`}
      sections={sections}
    />
  );
}
