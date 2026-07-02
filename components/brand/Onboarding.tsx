'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand/types';
import { BrandPreview } from './BrandPreview';

// The prompt a new speaker copies into their preferred AI (ChatGPT, Claude,
// Gemini, etc.) to pull that AI's existing "memory" of them. Whatever the AI
// returns is pasted back and saved to the private brand.voice.aiProfile field,
// reserved as context for the app's own AI features (analyzer, agent, tips,
// keynote tailoring) so they can write and coach in a way that sounds like them.
const AI_MEMORY_PROMPT = `You know me from our past conversations. I'm setting up a tool that helps me prepare and improve as a public speaker, and it works best when it understands who I am.

Based on everything you know about me, write a concise profile of me as a speaker. Include: who I am and what I do, the topics and expertise I speak on, my speaking style and tone of voice, who my audience is, my goals, and any personality or voice traits that would help another AI write and coach in a way that genuinely sounds like me.

Write it as a direct profile I can paste into another tool — not a message back to me.`;

type Step = 'name' | 'ai-memory' | 'website' | 'preview';
const ORDER: Step[] = ['name', 'ai-memory', 'website', 'preview'];

export function Onboarding({ defaultBrand }: { defaultBrand: BrandKit }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState<BrandKit>(defaultBrand);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aboutMemory, setAboutMemory] = useState('');
  const [copied, setCopied] = useState(false);

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
    // Save the pasted AI-memory profile to the PRIVATE voice.aiProfile field
    // (not voice.about, which is surfaced on the public one-sheet). Reserved as
    // context for the app's AI features.
    if (aboutMemory.trim()) {
      finalKit.voice = { ...finalKit.voice, aiProfile: aboutMemory.trim() };
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

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_MEMORY_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy automatically — select the prompt text and copy it manually.');
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
        <p className="eyebrow">Set up your hub · {stepIndex + 1} of {ORDER.length}</p>
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
          style={{ width: `${((stepIndex + 1) / ORDER.length) * 100}%` }}
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
            setStep('ai-memory');
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

      {/* Step 2 — AI memory */}
      {step === 'ai-memory' && (
        <div>
          <h1 className="display-h1 mb-3">
            Bring your{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              AI&apos;s memory
            </span>{' '}
            of you.
          </h1>
          <p className="mb-6 text-muted">
            Already chat with ChatGPT, Claude, or Gemini? Copy the prompt below, paste it into your
            preferred AI, then paste what it says back here. We&apos;ll use it so the hub&apos;s AI
            writes and coaches in a way that already sounds like you.
          </p>

          {/* The copyable prompt */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="eyebrow">Copy this prompt</p>
              <button
                type="button"
                onClick={copyPrompt}
                className="btn-ghost text-xs"
              >
                {copied ? 'Copied ✓' : 'Copy prompt'}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-body">{AI_MEMORY_PROMPT}</p>
          </div>

          {/* Paste-back */}
          <label htmlFor="ai-memory" className="mt-6 mb-2 block text-sm font-semibold text-strong">
            Paste what your AI said about you
          </label>
          <textarea
            id="ai-memory"
            value={aboutMemory}
            onChange={(e) => setAboutMemory(e.target.value)}
            placeholder="Paste your AI's profile of you here — or skip this step."
            rows={6}
            className="input w-full resize-y"
          />
          {error && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => { setError(''); setStep('website'); }} className="btn-primary">
              Continue
            </button>
            <button type="button" onClick={() => { setError(''); setStep('name'); }} className="btn-ghost">
              Back
            </button>
            <button
              type="button"
              onClick={() => { setError(''); setAboutMemory(''); setStep('website'); }}
              className="ml-auto text-sm font-semibold text-muted transition-colors hover:text-strong"
            >
              Skip this step →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — website */}
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
            <button type="button" onClick={() => { setError(''); setStep('ai-memory'); }} className="btn-ghost">
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

      {/* Step 4 — preview */}
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
