// Shared marketing copy that is used in more than one place — currently the
// FAQ, which the landing page renders visually and the structured-data block
// emits as schema.org JSON-LD (so Google/AI answer engines can show it as a
// rich result). Keeping it here means the two never drift apart.

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: 'Who is Speaker Hub for?',
    a: 'Professional and aspiring public speakers — keynoters, coaches, founders, and anyone who wants to get measurably better on stage and run the business side of speaking from one place.',
  },
  {
    q: 'Do I need any editing or technical skills?',
    a: 'No. Upload a talk and the analysis, script tools, and clip editor do the heavy lifting. If you can send an email, you can use Speaker Hub.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. The Free plan lets you analyze your talks with no limit, keep them in your Talk Library, and compare two talks — no credit card required.',
  },
  {
    q: 'How does the AI analysis work?',
    a: 'Your talk gets transcribed, then scored moment by moment for engagement. You see exactly where attention rose and fell, with specific notes you can act on before your next performance.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. Plans are month to month — upgrade, downgrade, or cancel whenever you like from your account settings.',
  },
];
