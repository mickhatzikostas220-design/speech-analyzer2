'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand/types';
import { BrandPreview } from './BrandPreview';

type Step = 'name' | 'website' | 'preview';
const ORDER: Step[] = ['name', 'website', 'preview'];

export function Onboarding({ defaultBrand }: { defaultBrand: BrandKit }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState<BrandKit>(defaultBrand);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stepIndex = ORDER.indexOf(step);

  /** Save the kit (applying the entered name) and finish onboarding. */
  async function finalize(kit: BrandKit, websiteUrl?: string) {
    setSaving(true);
    setError('');
    const finalKit: BrandKit = JSON.parse(JSON.stringify(kit));
    if (name.trim()) {
      finalKit.name = name.trim();
      if (finalKit.logo.type === 'wordmark') finalKit.logo.wordmarkText = name.trim();
    }
    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: finalKit, websiteUrl, onboard: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not save. Try again.');
        setSaving(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Could not save. Try again.');
      setSaving(false);
    }
  }

  async function extract(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError('Enter your website, or skip this step.');
      return;
    }
    setLoading(true);
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
        setLoading(false);
        return;
      }
      const kit = data.brand as BrandKit;
      if (name.trim()) kit.name = name.trim();
      setBrand(kit);
      setStep('preview');
      setLoading(false);
    } catch {
      setError('Network hiccup — try again, or skip this step.');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12 sm:py-16">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">Set up your hub · {stepIndex + 1} of 3</p>
        <button
          onClick={() => finalize(defaultBrand)}
          disabled={saving}
          className="text-xs font-semibold text-muted transition-colors hover:text-strong"
        >
          Skip for now
        </button>
      </div>

      {/* progress */}
      <div className="mb-9 h-1.5 w-full rounded-full bg-[var(--surface-sunk)]">
        <div
          className="h-1.5 rounded-full bg-[var(--signature)] transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / 3) * 100}%` }}
        />
      </div>

      {/* Step 1 — name */}
      {step === 'name' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError('Tell us your name, or skip.');
              return;
            }
            setError('');
            setStep('website');
          }}
        >
          <h1 className="display-h1 mb-3">
            First things first —{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              what&apos;s your name?
            </span>
          </h1>
          <p className="mb-8 text-muted">We&apos;ll use it to greet you and set your wordmark.</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan Rivers"
            className="input w-full"
          />
          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="mt-5">
            <button type="submit" className="btn-primary">
              Continue
            </button>
          </div>
        </form>
      )}

      {/* Step 2 — website */}
      {step === 'website' && (
        <form onSubmit={extract}>
          <h1 className="display-h1 mb-3">
            Got a website we can{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              borrow your look
            </span>{' '}
            from?
          </h1>
          <p className="mb-8 text-muted">
            We&apos;ll pull your colors, logo, and fonts so the hub feels like you — not us.
          </p>
          <input
            autoFocus
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourname.com"
            className="input w-full"
          />
          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Reading your brand…' : 'Build my brand'}
            </button>
            <button type="button" onClick={() => { setError(''); setStep('name'); }} className="btn-ghost">
              Back
            </button>
            <button
              type="button"
              onClick={() => finalize(defaultBrand)}
              disabled={saving}
              className="ml-auto text-sm font-semibold text-muted transition-colors hover:text-strong"
            >
              I don&apos;t have one →
            </button>
          </div>
        </form>
      )}

      {/* Step 3 — preview */}
      {step === 'preview' && (
        <div>
          <h1 className="display-h1 mb-3">
            Here&apos;s{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              your hub
            </span>
            .
          </h1>
          <p className="mb-6 text-muted">
            Pulled from{' '}
            <span className="font-semibold text-strong">{brand.sourceUrl || url}</span>. You can
            fine-tune anything later in Settings.
          </p>
          <BrandPreview brand={{ ...brand, name: name.trim() || brand.name }} />
          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => finalize(brand, brand.sourceUrl || url)}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Setting up…' : 'Use this brand'}
            </button>
            <button type="button" onClick={() => { setError(''); setStep('website'); }} className="btn-ghost">
              Try another site
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
