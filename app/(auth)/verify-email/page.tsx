import Link from 'next/link';

export default function VerifyEmailPage() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-white">Check your email</h1>
      <p className="text-zinc-400 text-sm leading-relaxed">
        We sent a verification link to your email address. Click it to activate your account.
      </p>
      <p className="text-zinc-600 text-xs">
        Already verified?{' '}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
