import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/marketing/LandingPage';

// The public entry point. Signed-in speakers go straight to their hub; everyone
// else sees the marketing landing page that explains what Speaker Hub is.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/dashboard');

  return <LandingPage />;
}
