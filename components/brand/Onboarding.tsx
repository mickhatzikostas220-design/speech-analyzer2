'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import type { BrandKit } from '@/lib/brand/types';
import { TOOLS } from '@/lib/tools/catalog';
import { BrandPreview } from './BrandPreview';

// How many tools a speaker may pin during onboarding. They can pick fewer.
const MAX_FAVORITES = 5;

// The prompt a new speaker copies into their preferred AI (ChatGPT, Claude,
// Gemini, etc.) to pull that AI's existing "memory" of them. Whatever the AI
// returns is pasted back and saved to the private brand.voice.aiProfile field,
// reserved as context for the app's own AI features (analyzer, agent, tips,
// keynote tailoring) so they can write and coach in a way that sounds like them.
const AI_MEMORY_PROMPT = `You know me from our past conversations. I'm setting up a tool that helps me prepare and improve as a public speaker, and it works best when it understands who I am.

Based on everything you know about me, write a concise profile of me as a speaker. Include: who I am and what I do, the topics and expertise I speak on, my speaking style and tone of voice, who my audience is, my goals, and any personality or voice traits that would help another AI write and coach in a way that genuinely sounds like me.

Write it as a direct profile I can paste into another tool — not a message back to me.`;

type Step = 'name' | 'ai-memory' | 'website' | 'preview' | 'tools';
const ORDER: Step[] = ['name', 'ai-memory', 'website', 'preview', 'tools'];

// The final step has two phases: a one-by-one tour of every tool, then a grid
// where the speaker picks the ones to pin.
type ToolPhase = 'tour' | 'pick';

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

  // Tools step (final): which phase we're in, where we are in the tour, the
  // keys the speaker has picked, and which brand step we arrived from (so the
  // tour's "Back" on the first card returns there).
  const [toolPhase, setToolPhase] = useState<ToolPhase>('tour');
  const [tourIndex, setTourIndex] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [pendingUrl, setPendingUrl] = useState<string | undefined>(undefined);
  const [toolsFrom, setToolsFrom] = useState<Step>('website');

  const stepIndex = ORDER.indexOf(step);

  /** Move to the final tools step, remembering the brand + url to save later. */
  function goToTools(kit: BrandKit, websiteUrl: string | undefined, from: Step) {
    setBrand(kit);
    setPendingUrl(websiteUrl);
    setToolsFrom(from);
    setToolPhase('tour');
    setTourIndex(0);
    setError('');
    setStep('tools');
  }

  /** Add or remove a tool key from the picks, capped at MAX_FAVORITES. */
  function togglePick(key: string) {
    setPicks((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= MAX_FAVORITES) return cur; // at the cap — ignore
      return [...cur, key];
    });
  }

  /** Save the kit (applying the entered name) and finish onboarding. */
  async function finalize(kit: BrandKit, websiteUrl?: string, favorites?: string[]) {
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
        body: JSON.stringify({ brand: finalKit, websiteUrl, onboard: true, favoriteTools: favorites }),
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
              onClick={() => goToTools(defaultBrand, undefined, 'website')}
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
              onClick={() => goToTools(brand, brand.sourceUrl || url, 'preview')}
              className="btn-primary"
            >
              Use this brand
            </button>
            <button type="button" onClick={() => { setError(''); setStep('website'); }} className="btn-ghost">
              Try another site
            </button>
          </div>
        </div>
      )}

      {/* Step 5 — tools: tour every tool, then pick up to 5 to pin. */}
      {step === 'tools' && toolPhase === 'tour' && (() => {
        const tool = TOOLS[tourIndex];
        const Icon = tool.icon;
        const isLast = tourIndex === TOOLS.length - 1;
        return (
          <div>
            <p className="eyebrow mb-3">Meet your tools · {tourIndex + 1} of {TOOLS.length}</p>
            <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card p-6">
              <span
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px]"
                style={{ background: tool.bg, color: tool.fg }}
              >
                <Icon className="h-7 w-7" strokeWidth={2.25} />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold text-strong">{tool.name}</h2>
                {tool.tier && (
                  <span className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-faint">
                    {tool.tier === 'full' ? 'Full' : 'Core'}
                  </span>
                )}
              </div>
              <p className="mt-2 text-muted">{tool.desc}</p>
            </div>

            {/* Tour progress dots */}
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {TOOLS.map((t, i) => (
                <span
                  key={t.key}
                  className={`h-1.5 rounded-full transition-all ${
                    i === tourIndex ? 'w-6 bg-[var(--signature)]' : 'w-1.5 bg-[var(--surface-sunk)]'
                  }`}
                />
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  tourIndex > 0 ? setTourIndex(tourIndex - 1) : setStep(toolsFrom)
                }
                className="btn-ghost"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => (isLast ? setToolPhase('pick') : setTourIndex(tourIndex + 1))}
                className="btn-primary"
              >
                {isLast ? 'Choose my favorites' : 'Next'}
              </button>
              <button
                type="button"
                onClick={() => setToolPhase('pick')}
                className="ml-auto text-sm font-semibold text-muted transition-colors hover:text-strong"
              >
                Skip tour →
              </button>
            </div>
          </div>
        );
      })()}

      {step === 'tools' && toolPhase === 'pick' && (
        <div>
          <h1 className="display-h1 mb-3">
            Now pick the ones you&apos;re{' '}
            <span className="script" style={{ fontSize: '1.2em' }}>
              most excited
            </span>{' '}
            to use.
          </h1>
          <p className="mb-6 text-muted">
            Choose up to {MAX_FAVORITES}. They&apos;ll be pinned to your top bar for quick access —
            you can change them anytime from the Hub.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const chosen = picks.includes(tool.key);
              const atCap = picks.length >= MAX_FAVORITES && !chosen;
              return (
                <button
                  key={tool.key}
                  type="button"
                  onClick={() => togglePick(tool.key)}
                  disabled={atCap}
                  aria-pressed={chosen}
                  className={`flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-left transition-all ${
                    chosen
                      ? 'border-[var(--signature)] bg-[var(--surface-sunk)]'
                      : 'border-[var(--border-subtle)] bg-surface-card hover:border-strong'
                  } ${atCap ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                    style={{ background: tool.bg, color: tool.fg }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-extrabold text-strong">{tool.name}</span>
                      {chosen && (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full"
                          style={{ background: 'var(--signature)', color: 'var(--on-signature)' }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{tool.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {error && <p className="mt-4 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => { setToolPhase('tour'); setTourIndex(TOOLS.length - 1); }}
              className="btn-ghost"
            >
              Back
            </button>
            <button
              type="button"
              disabled={picks.length < 1 || saving}
              onClick={() => finalize(brand, pendingUrl, picks)}
              className="btn-primary"
            >
              {saving ? 'Setting up…' : 'Finish setup'}
            </button>
            <span className="ml-auto text-sm font-semibold text-muted">
              {picks.length} of {MAX_FAVORITES} chosen
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
