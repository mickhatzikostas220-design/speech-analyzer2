// Public Accessibility Statement page (/accessibility). Declares the WCAG
// conformance target the team is working to, lists the accessibility features
// already built in, and gives visitors a way to report barriers or request
// accommodations. Publishing a statement like this is a recognized best
// practice for demonstrating a good-faith ADA / Section 508 commitment.
//
// NOTE for Mick: the accessibility contact email is set below. Update the
// "last reviewed" date whenever you re-audit the site.

import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/marketing/LegalPage';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description: `How ${SITE_NAME} works to keep the product usable for everyone, and how to report an accessibility barrier.`,
  robots: { index: true, follow: true },
};

const CONTACT_EMAIL = 'mickhatzikostas220@gmail.com';

const sections: LegalSection[] = [
  {
    heading: 'Our commitment',
    paragraphs: [
      `${SITE_NAME} is committed to making our product usable for as many people as possible, including people with disabilities. We want everyone to be able to prepare, analyze, and improve their talks with our tools.`,
      'Accessibility is an ongoing effort. As we add new tools and features, we work to keep them usable with a keyboard, a screen reader, and other assistive technologies.',
    ],
  },
  {
    heading: 'Conformance target',
    paragraphs: [
      'We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. These guidelines explain how to make web content more accessible to people with a wide range of disabilities, including visual, hearing, motor, and cognitive disabilities.',
      'We test our work against this standard, but some parts of the product may not yet fully meet it. Where we fall short, we treat it as a bug and work to fix it.',
    ],
  },
  {
    heading: 'What we have built in',
    paragraphs: [
      'Semantic, keyboard-navigable pages with a visible focus indicator and a "skip to content" link so keyboard users can bypass repeated navigation.',
      'Form fields with associated labels, and status and error messages that are announced to assistive technologies.',
      'Text and interface colors chosen to meet AA contrast ratios, and support for the operating-system "reduce motion" setting so animations can be minimized.',
    ],
  },
  {
    heading: 'Known limitations',
    paragraphs: [
      'Some AI-generated media — such as auto-generated video clips — may not yet include captions or transcripts for every output. Where a feature produces audio or video, we are working to make text alternatives available.',
      'If you rely on an assistive technology and hit a barrier anywhere in the product, we want to hear about it so we can prioritize a fix.',
    ],
  },
  {
    heading: 'Reporting a barrier or requesting help',
    paragraphs: [
      `If you have trouble using any part of ${SITE_NAME}, or you need information provided in a different format, contact us at ${CONTACT_EMAIL}. Please include the page or feature, what you were trying to do, and the assistive technology you were using so we can reproduce and fix the issue.`,
      'We aim to respond to accessibility feedback within a reasonable time and to offer a workable alternative while we resolve the underlying issue.',
    ],
  },
];

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility Statement"
      updated="July 1, 2026"
      intro={`This statement describes how ${SITE_NAME} approaches accessibility, the standard we work toward, and how to reach us if something is not working for you.`}
      sections={sections}
    />
  );
}
