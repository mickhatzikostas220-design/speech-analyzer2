import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardHome } from '@/components/DashboardHome';

export const dynamic = 'force-dynamic';

export default function AnalyzePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>
      <p className="eyebrow mb-2">Speech Analyzer</p>
      <DashboardHome />
    </div>
  );
}
