// Passthrough layout to title the (client-component) forgot-password page.
// Kept out of search results — it is a transient account-recovery step.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
