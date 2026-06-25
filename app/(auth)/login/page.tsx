'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
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
          background: '#1A2B50',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9,
              background: '#fff', color: '#1A2B50',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 17,
            }}>O</span>
            <span style={{ fontWeight: 800, fontSize: 19, color: '#fff' }}>Orator</span>
          </div>
          <div>
            <p style={{
              fontFamily: "'Alex Brush', cursive",
              fontSize: 30, lineHeight: 1.05,
              color: '#F8E337', margin: '0 0 10px',
            }}>Welcome back.</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,.7)' }}>
              Every tool a speaker needs, in one place.
            </p>
          </div>
        </div>

        {/* Form */}
        <div style={{ flex: 1, padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.01em', color: '#111114', margin: '0 0 24px' }}>
              Sign in
            </h1>

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
                  placeholder="••••••••"
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

              <Link href="/forgot-password" style={{
                fontSize: 12, fontWeight: 600, color: '#2E4D8E',
                textDecoration: 'none', marginTop: -6,
              }}>
                Forgot password?
              </Link>

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
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>

            <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: 13, color: '#6E6E78' }}>
              No account?{' '}
              <Link href="/signup" style={{ fontWeight: 700, color: '#2E4D8E', textDecoration: 'none' }}>
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
