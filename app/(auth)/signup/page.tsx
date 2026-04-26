import Link from 'next/link';

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">Invite only</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Access to Orator is by invitation. If you've been approved, check your email for a sign-up link.
        </p>
        <Link
          href="/request-access"
          className="inline-block w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          Request access
        </Link>
      </div>
      <p className="text-center text-zinc-500 text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
