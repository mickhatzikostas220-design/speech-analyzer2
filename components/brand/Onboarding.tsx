'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand/types';
import { BrandPreview } from './BrandPreview';

type Step = 'url' | 'loading' | 'preview' | 'error';

export function Onboarding({ defaultBrand }: { defaultBrand: BrandKit }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState<BrandKit>(defaultBrand);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function build(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError('Pop in your website address first.');
      setStep('error');
      return;
    }
    setStep('loading');
    setError('');
    try {
      const res = await fetch('/api/brand/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not read that site.');
        setStep('error');
        return;
      }
      setBrand(data.brand);
      setStep('preview');
    } catch {
      setError('Network hiccup — try again, or use the default look for now.');
      setStep('error');
    }
  }

  async function save(kit: BrandKit, websiteUrl?: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: kit, websiteUrl, onboard: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save your brand.');
        setStep('error');
        setSaving(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not save your brand. Try again.');
      setStep('error');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12 sm:py-16">
      <p className="eyebrow mb-3">Welcome to your Speaker Hub</p>
      <h1
        className="mb-3 text-4xl sm:text-5xl"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.02em' }}
      >
        Let&apos;s make this hub{' '}
        <span style={{ fontFamily: 'var(--font-script)', fontWeight: 400, fontSize: '1.25em' }}>
          yours
        </span>
        .
      </h1>
      <p className="mb-8 text-[var(--text-muted)]">
        Drop in your website and we&apos;ll pull your colors, logo, and fonts so the whole place
        feels like you — not us.
      </p>

      {(step === 'url' || step === 'error') && (
        <form onSubmit={build} className="space-y-4">
          <div>
            <label htmlFor="site" className="mb-1.5 block text-sm font-semibold text-[var(--text-strong)]">
              Your website
            </label>
            <input
              id="site"
              type="text"
              inputMode="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourname.com"
              className="w-full rounded-[var(--radius-sm)] border-2 border-[var(--border-strong)] bg-[var(--surface-card)] px-4 py-3 text-[var(--text-strong)] outline-none focus:shadow-[var(--focus-shadow)]"
            />
          </div>

          {step === 'error' && (
            <p className="rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" className="btn-primary">
              Build my brand
            </button>
            <button
              type="button"
              onClick={() => save(defaultBrand)}
              disabled={saving}
              className="btn-ghost"
            >
              I don&apos;t have one — use the default
            </button>
          </div>
        </form>
      )}

      {step === 'loading' && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border-2 border-[var(--border-strong)] bg-[var(--surface-card)] px-5 py-6">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ink-300)] border-t-[var(--signature)]" />
          <span className="font-semibold text-[var(--text-strong)]">Reading your brand…</span>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-6">
          <BrandPreview brand={brand} />
          <p className="text-sm text-[var(--text-muted)]">
            Pulled from{' '}
            <span className="font-semibold text-[var(--text-strong)]">{brand.sourceUrl || url}</span>.
            You can fine-tune any of this later in Settings.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => save(brand, brand.sourceUrl || url)} disabled={saving} className="btn-primary">
              {saving ? 'Setting up…' : 'Use this brand'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('url');
              }}
              className="btn-ghost"
            >
              Try a different site
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
