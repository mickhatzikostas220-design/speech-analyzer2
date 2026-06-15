import Link from 'next/link';

export default function RequestAccessSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--signature)]">
          <svg className="h-7 w-7" style={{ color: 'var(--on-signature)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="section-title" style={{ marginBottom: 0 }}>Request submitted</h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          We&apos;ll review your request and get back to you by email. This usually takes 1–2 business days.
        </p>
        <Link href="/" className="mt-4 inline-block text-xs font-semibold text-muted transition-colors hover:text-strong">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
