'use client';

// Beta feedback form. Lets a signed-in speaker pick what kind of note they're
// leaving (a request, criticism, a bug, or anything else) and write a message.
// Posts to /api/feedback and shows a thank-you on success.
import { useState } from 'react';

const CATEGORIES = [
  { value: 'feature', label: 'Something I want to see' },
  { value: 'criticism', label: 'Criticism / what’s not working' },
  { value: 'bug', label: 'A bug' },
  { value: 'other', label: 'Something else' },
] as const;

export function FeedbackForm() {
  const [category, setCategory] = useState<string>('feature');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || status === 'sending') return;
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('idle');
        return;
      }
      setMessage('');
      setStatus('sent');
    } catch {
      setError('Network error. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="card p-6 text-center">
        <p className="font-semibold text-strong">Thank you — got it.</p>
        <p className="mt-1 text-sm text-muted">
          We read every note, and it genuinely shapes what gets built next.
        </p>
        <button onClick={() => setStatus('idle')} className="btn-outline mt-4 text-sm !px-4 !py-2">
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-body">What&rsquo;s this about?</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.value}
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={`rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors ${
                category === c.value
                  ? 'border-[color:var(--signature)] bg-[var(--surface-sunk)] font-semibold text-strong'
                  : 'border-[var(--border-subtle)] text-muted hover:text-strong'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="fb-msg" className="mb-2 block text-sm font-medium text-body">
          Your message
        </label>
        <textarea
          id="fb-msg"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setError(null);
          }}
          rows={6}
          maxLength={4000}
          placeholder="Tell us what you'd love to see, or what's getting in your way…"
          className="input w-full resize-y"
        />
        <p className="mt-1 text-right text-xs text-faint">{message.length}/4000</p>
      </div>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

      <button type="submit" disabled={!message.trim() || status === 'sending'} className="btn-primary">
        {status === 'sending' ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  );
}
