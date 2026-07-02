// Passthrough layout that only exists to give the (client-component) signup
// page a proper <title> for the browser tab and search results.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a free Speaker Hub account and set up your speaking hub in a minute.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
