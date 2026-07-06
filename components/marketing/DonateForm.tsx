'use client';

// Interactive donation form used on the public /donate page. Lets a visitor pick
// or type an amount, choose a one-time or monthly gift, and start Stripe
// Checkout. No account is required — the request goes to /api/donate/checkout,
// which returns a hosted Stripe URL we redirect to.

import { useState } from 'react';
import { Heart, Loader2, ArrowUpRight } from 'lucide-react';
import { DONATE_PRESETS, DONATE_MIN, DONATE_MAX, DONATE_EXTERNAL } from '@/lib/donate/config';

type Frequency = 'once' | 'monthly';

export function DonateForm() {
  const [frequency, setFrequency] = useState<Frequency>('once');
  // The selected preset (used when there is no custom amount typed in).
  const [preset, setPreset] = useState<number>(DONATE_PRESETS[1]);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A typed custom amount always wins over the preset selection.
  const usingCustom = custom.trim() !== '';
  const amount = usingCustom ? Number(custom) : preset;
  const amountValid = Number.isFinite(amount) && amount >= DONATE_MIN && amount <= DONATE_MAX;

  async function handleDonate() {
    setError(null);
    if (!amountValid) {
      setError(`Please enter an amount between $${DONATE_MIN} and $${DONATE_MAX}.`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/donate/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, frequency }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      // Hand off to Stripe's secure hosted checkout page.
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 sm:p-8" style={{ boxShadow: 'var(--shadow-hard)' }}>
      {/* One-time vs monthly */}
      <div className="inline-flex rounded-pill border border-[var(--border-subtle)] bg-surface-sunk p-1">
        {(['once', 'monthly'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFrequency(f)}
            className={`rounded-pill px-5 py-1.5 text-sm font-bold transition-colors ${
              frequency === f ? 'bg-surface-card text-strong shadow-soft' : 'text-muted hover:text-strong'
            }`}
          >
            {f === 'once' ? 'One-time' : 'Monthly'}
          </button>
        ))}
      </div>

      {/* Preset amounts */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {DONATE_PRESETS.map((value) => {
          const selected = !usingCustom && preset === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPreset(value);
                setCustom('');
                setError(null);
              }}
              className={`rounded-[var(--radius-md)] border-2 py-3 text-lg font-black transition-all ${
                selected
                  ? 'border-strong bg-surface-sunk text-strong'
                  : 'border-[var(--border-subtle)] text-muted hover:border-strong hover:text-strong'
              }`}
            >
              ${value}
            </button>
          );
        })}
      </div>

      {/* Custom amount */}
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-semibold text-muted">Or enter your own amount</span>
        <div className="flex items-center rounded-[var(--radius-md)] border-2 border-[var(--border-subtle)] px-3 focus-within:border-strong">
          <span className="text-lg font-black text-muted">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={DONATE_MIN}
            max={DONATE_MAX}
            placeholder="25"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setError(null);
            }}
            className="w-full bg-transparent px-2 py-3 text-lg font-bold text-strong outline-none"
          />
          {frequency === 'monthly' ? (
            <span className="text-sm font-semibold text-faint">/mo</span>
          ) : null}
        </div>
      </label>

      {error ? <p className="mt-3 text-sm font-semibold text-[var(--red)]">{error}</p> : null}

      <button
        type="button"
        onClick={handleDonate}
        disabled={loading || !amountValid}
        className="btn-primary mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
          </>
        ) : (
          <>
            <Heart className="h-4 w-4" />
            {amountValid
              ? `Donate $${amount}${frequency === 'monthly' ? '/mo' : ''}`
              : 'Donate'}
          </>
        )}
      </button>

      <p className="mt-4 text-center text-xs text-faint">
        Secure payment by Stripe. {frequency === 'monthly' ? 'Cancel anytime.' : 'One-time, no account needed.'}
      </p>

      {/* Optional third-party donation link — only shown once a URL is configured. */}
      {DONATE_EXTERNAL.url ? (
        <div className="mt-6 border-t border-[var(--border-subtle)] pt-5 text-center">
          <p className="text-sm text-muted">Prefer another way to give?</p>
          <a
            href={DONATE_EXTERNAL.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline mt-3 w-full justify-center"
          >
            {DONATE_EXTERNAL.label || 'Donate another way'} <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
