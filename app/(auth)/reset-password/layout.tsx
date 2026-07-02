// Passthrough layout to title the (client-component) reset-password page.
// Kept out of search results — it is a transient account-recovery step.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
