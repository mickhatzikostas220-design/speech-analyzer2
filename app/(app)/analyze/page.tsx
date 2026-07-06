// Speech Analyzer page. Renders the upload + recent-analyses hub. The analyzer
// is free and unlimited for every signed-in speaker, so there's no quota to
// show here — the only guard is a burst rate-limit in app/api/analyses. The
// ModelCredits block at the bottom carries the required attribution for the
// AI models the analyzer runs on (see components/ModelCredits.tsx).
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { DashboardHome } from '@/components/DashboardHome';
import { ModelCredits } from '@/components/ModelCredits';

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
      <ModelCredits className="mt-10" />
    </div>
  );
}
