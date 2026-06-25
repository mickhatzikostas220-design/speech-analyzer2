'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const CHECK_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F9D55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push('/onboarding');
      router.refresh();
    } else {
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    }
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 12px 40px rgba(20,30,55,.12)',
      overflow: 'hidden',
      fontFamily: 'Montserrat, sans-serif',
      width: '100%',
      maxWidth: 480,
    }}>
      <div style={{ display: 'flex', minHeight: 560 }}>
        {/* Brand rail */}
        <div style={{
          width: 170,
          flexShrink: 0,
          background: '#111114',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9,
              background: '#1A2B50', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17,
            }}>O</span>
            <span style={{ fontWeight: 800, fontSize: 19, color: '#fff' }}>Orator</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              'Neural engagement scoring',
              'Clip & script studio',
              'Booking inbox',
            ].map((feature) => (
              <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'rgba(255,255,255,.82)' }}>
                {CHECK_ICON}
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.01em', color: '#111114', margin: '0 0 4px' }}>
              Create your account
            </h1>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6E6E78' }}>
              No invite needed — set up your hub in a minute.
            </p>

            {error && (
              <div style={{
                borderRadius: 8, background: 'var(--danger-bg, #fde2d9)',
                padding: '8px 12px', fontSize: 13, color: 'var(--danger, #d63e10)',
                marginBottom: 18,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{
                  display: 'block', fontSize: 12, fontWeight: 700,
                  color: '#4A4A52', marginBottom: 7, letterSpacing: '0.02em',
                }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '2px solid #E5E5EA', borderRadius: 10,
                    padding: '11px 14px', fontSize: 14,
                    outline: 'none', fontFamily: 'Montserrat, sans-serif',
                    transition: 'border-color .15s',
                    color: '#111114',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#1A2B50')}
                  onBlur={e => (e.target.style.borderColor = '#E5E5EA')}
                />
              </div>

              <div>
                <label style={{
                  display: 'block', fontSize: 12, fontWeight: 700,
                  color: '#4A4A52', marginBottom: 7, letterSpacing: '0.02em',
                }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 6 characters"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '2px solid #E5E5EA', borderRadius: 10,
                    padding: '11px 14px', fontSize: 14,
                    outline: 'none', fontFamily: 'Montserrat, sans-serif',
                    transition: 'border-color .15s',
                    color: '#111114',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#1A2B50')}
                  onBlur={e => (e.target.style.borderColor = '#E5E5EA')}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4, width: '100%',
                  background: loading ? '#3a5080' : '#1A2B50',
                  color: '#fff', border: '2px solid #111114',
                  borderRadius: 999, padding: '13px',
                  fontSize: 15, fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '4px 4px 0 #111114',
                  fontFamily: 'Montserrat, sans-serif',
                  transition: 'transform .12s, box-shadow .12s',
                }}
                onMouseEnter={e => {
                  if (!loading) {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '5px 5px 0 #111114';
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #111114';
                }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>

            <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13, color: '#6E6E78' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ fontWeight: 700, color: '#2E4D8E', textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
