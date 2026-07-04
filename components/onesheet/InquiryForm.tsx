'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const EMPTY = {
  contact_name: '',
  contact_email: '',
  organization: '',
  event_name: '',
  event_date: '',
  location: '',
  message: '',
  website: '', // honeypot
};

export function InquiryForm({ slug, speakerName }: { slug: string; speakerName: string }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const first = (speakerName || 'them').split(' ')[0];

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.contact_email.trim()) {
      setError('Add your email so they can reach you.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/public/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...form }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'Could not send. Try again.');
      else setSent(true);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--signature)]">
          <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--on-signature)' }} />
        </span>
        <h3 className="text-lg font-extrabold text-strong">Sent!</h3>
        <p className="max-w-sm text-sm text-muted">
          Your inquiry is on its way to {first}. You&apos;ll hear back at{' '}
          <span className="font-semibold text-strong">{form.contact_email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-6">
      {/* honeypot */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => set('website', e.target.value)}
        className="hidden"
        aria-hidden
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Your name" className="input w-full text-sm" placeholder="Your name" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
        <input type="email" required aria-label="Your email (required)" className="input w-full text-sm" placeholder="Your email *" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
        <input aria-label="Organization" className="input w-full text-sm" placeholder="Organization" value={form.organization} onChange={(e) => set('organization', e.target.value)} />
        <input aria-label="Event name" className="input w-full text-sm" placeholder="Event name" value={form.event_name} onChange={(e) => set('event_name', e.target.value)} />
        <input type="date" aria-label="Event date" className="input w-full text-sm" value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
        <input aria-label="Location" className="input w-full text-sm" placeholder="Location" value={form.location} onChange={(e) => set('location', e.target.value)} />
      </div>
      <textarea
        rows={4}
        aria-label="Message about your event"
        className="input w-full resize-none text-sm"
        placeholder={`Tell ${first} about your event — audience, goals, budget…`}
        value={form.message}
        onChange={(e) => set('message', e.target.value)}
      />
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
        {busy ? 'Sending…' : `Send inquiry to ${first}`}
      </button>
    </form>
  );
}
