// Passthrough layout that only exists to give the (client-component) login
// page a proper <title> for the browser tab and search results.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Speaker Hub account.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
