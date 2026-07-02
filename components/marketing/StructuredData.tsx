// schema.org JSON-LD for the public landing page. This is invisible markup that
// search engines and AI answer engines read to understand the product, show
// pricing, and render FAQ rich results — the same "get cited by AI" idea the
// app's own SEO & AEO tool is about. Data is pulled from the real plans and the
// shared FAQ copy so it can never contradict what visitors see on the page.

import { PLANS } from '@/lib/subscription/plans';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import { FAQS } from '@/components/marketing/content';

export function StructuredData() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: SITE_DESCRIPTION,
        url: SITE_URL,
        offers: PLANS.map((p) => ({
          '@type': 'Offer',
          name: p.name,
          price: String(p.price),
          priceCurrency: 'USD',
          category: p.price === 0 ? 'free' : 'subscription',
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify of fully-controlled, non-user data — safe to inline.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
