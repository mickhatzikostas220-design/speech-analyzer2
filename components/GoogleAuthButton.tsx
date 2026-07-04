'use client';

// Reusable "Continue with Google" button used on the login and signup pages.
// It starts Supabase's Google OAuth flow: Supabase bounces the user to Google,
// then back to /auth/callback (our existing route), which exchanges the code
// for a session and lands them on /dashboard. Google accounts arrive
// pre-verified, so these users skip our email-code step entirely.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GoogleAuthButton({
  label = 'Continue with Google',
  onError,
}: {
  // Text on the button — e.g. "Sign in with Google" vs "Sign up with Google".
  label?: string;
  // Lets the parent page show the failure in its own error box, so we don't
  // duplicate error UI here. Called with '' to clear before a new attempt.
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    onError?.('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Return to our callback route on THIS origin, so it works on
        // localhost and prod without an env var. The route exchanges the
        // returned code for a session and redirects to /dashboard.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    // On success the browser is already navigating away to Google, so we only
    // reach this point if kicking off the redirect failed.
    if (error) {
      onError?.(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
        <span className="text-xs text-faint">or</span>
        <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
      </div>

      <button type="button" onClick={handleGoogle} disabled={loading} className="btn-outline w-full">
        <GoogleLogo />
        {loading ? 'Redirecting…' : label}
      </button>
    </div>
  );
}

// Official multi-color Google "G" mark.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
