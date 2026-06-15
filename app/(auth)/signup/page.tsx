import Link from 'next/link';

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--signature)]">
          <svg className="h-6 w-6" style={{ color: 'var(--on-signature)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="section-title" style={{ marginBottom: 0 }}>Invite only</h1>
        <p className="text-sm leading-relaxed text-muted">
          Access is by invitation. If you&apos;ve been approved, check your email for a sign-up link.
        </p>
        <Link href="/request-access" className="btn-primary w-full">
          Request access
        </Link>
      </div>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold" style={{ color: 'var(--text-link)' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
