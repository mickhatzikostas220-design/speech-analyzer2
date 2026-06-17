import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getUserBrandState } from '@/lib/brand/server';
import { OneSheetEditor } from '@/components/onesheet/OneSheetEditor';

export const dynamic = 'force-dynamic';

export default async function OneSheetSettingsPage() {
  const { userId } = await getUserBrandState();
  if (!userId) redirect('/login');

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/settings" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong">
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </Link>
      <p className="eyebrow mb-2">Public one-sheet</p>
      <h1 className="display-h1 mb-1" style={{ fontSize: 'var(--text-h2)' }}>Your speaker page</h1>
      <p className="mb-8 text-muted">
        A shareable, on-brand page with your bio, signature talks, and a “book me” form — wired straight
        to your Booking Inbox. It uses your brand colors, fonts, and logo automatically.
      </p>
      <OneSheetEditor />
    </div>
  );
}
