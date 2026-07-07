// Layout for the /request-access flow. Its only job is to tell search engines
// not to index the access-request form or its success page — /signup is the
// open, canonical way in, so we don't want a second competing "get started"
// page showing up in search results. The page itself is a client component and
// can't export metadata, so the noindex lives here (and covers the whole
// /request-access subtree, including /request-access/success).

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function RequestAccessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
