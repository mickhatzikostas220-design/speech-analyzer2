import Link from 'next/link';

export default function VerifyEmailPage() {
  return (
    <div className="card space-y-4 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--signature)]">
        <svg className="h-6 w-6" style={{ color: 'var(--on-signature)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="section-title" style={{ marginBottom: 0 }}>Check your email</h1>
      <p className="text-sm leading-relaxed text-muted">
        We sent a verification link to your email address. Click it to activate your account.
      </p>
      <p className="text-xs text-faint">
        Already verified?{' '}
        <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
