import { redirect } from 'next/navigation';
import { getUserBrandState } from '@/lib/brand/server';
import { Onboarding } from '@/components/brand/Onboarding';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const state = await getUserBrandState();
  if (!state.userId) redirect('/login');
  if (state.onboarded) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <Onboarding defaultBrand={state.brand} />
    </div>
  );
}
