import { redirect } from 'next/navigation';
import { getUserBrandState } from '@/lib/brand/server';
import { BrandSettings } from '@/components/brand/BrandSettings';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const state = await getUserBrandState();
  if (!state.userId) redirect('/login');

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="eyebrow mb-2">Settings</p>
      <h1 className="display-h1 mb-1">Your brand</h1>
      <p className="mb-8 text-muted">
        Make the hub feel like you. Changes apply across your whole hub.
      </p>
      <BrandSettings initialBrand={state.brand} />
    </div>
  );
}
