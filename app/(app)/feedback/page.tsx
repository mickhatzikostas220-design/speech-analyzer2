// Feedback page — where early speakers tell us what to build and what's not
// working during the free beta. The form posts to /api/feedback. Linked from the
// app-wide beta banner and the Plans page.
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FeedbackForm } from '@/components/FeedbackForm';

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>
      <p className="eyebrow mb-2">Feedback</p>
      <h1 className="display-h1 mb-1">Tell us what you want to see</h1>
      <p className="mb-8 text-muted">
        Speaker Hub is free while we&rsquo;re still building it, and what you say here decides
        what comes next. Feature ideas, sharp criticism, bugs you hit — all of it helps.
      </p>
      <FeedbackForm />
    </div>
  );
}
