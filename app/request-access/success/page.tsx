import Link from 'next/link';

export default function RequestAccessSuccessPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white">Request submitted</h1>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
          We'll review your request and send you an email with next steps. This usually takes 1–2 business days.
        </p>
        <Link
          href="/"
          className="inline-block text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-4"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
