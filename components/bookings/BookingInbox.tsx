'use client';

import { useState } from 'react';
import { Plus, Trash2, CalendarPlus, Mail, MapPin, Building2 } from 'lucide-react';
import {
  type Booking,
  type BookingStatus,
  BOOKING_STATUSES,
  STATUS_LABEL,
} from '@/lib/bookings/types';

const STATUS_STYLE: Record<BookingStatus, { dot: string; chip: string }> = {
  new: { dot: 'var(--signature)', chip: 'bg-[color:var(--signature)]/10 text-strong' },
  discussing: { dot: 'var(--score-mid)', chip: 'bg-[var(--warning-bg)] text-[#8A6D00]' },
  confirmed: { dot: 'var(--success)', chip: 'bg-[var(--success-bg)] text-[color:var(--success)]' },
  completed: { dot: 'var(--ink-400)', chip: 'bg-[var(--surface-sunk)] text-muted' },
  declined: { dot: 'var(--danger)', chip: 'bg-[var(--danger-bg)] text-[color:var(--danger)]' },
};

const EMPTY = {
  event_name: '',
  organization: '',
  contact_name: '',
  contact_email: '',
  event_date: '',
  location: '',
  fee: '',
  notes: '',
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BookingInbox({ initialBookings }: { initialBookings: Booking[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [addedGigs, setAddedGigs] = useState<Record<string, boolean>>({});

  async function addBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_name.trim() && !form.organization.trim() && !form.contact_name.trim()) {
      setMsg('Add at least an event, organization, or contact.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Could not save.');
      } else {
        setBookings((prev) => [data.booking as Booking, ...prev]);
        setForm({ ...EMPTY });
        setAdding(false);
      }
    } catch {
      setMsg('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<Booking>) {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...body } : b)));
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* optimistic; ignore */
    }
  }

  async function remove(id: string) {
    setBookings((prev) => prev.filter((b) => b.id !== id));
    try {
      await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    } catch {
      /* ignore */
    }
  }

  async function toGig(b: Booking) {
    const title = b.event_name || b.organization || 'Speaking engagement';
    const starts = b.event_date ? new Date(`${b.event_date}T12:00:00`).toISOString() : new Date().toISOString();
    try {
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, starts_at: starts, location: b.location, status: 'confirmed', kind: 'Keynote' }),
      });
      if (res.ok) setAddedGigs((m) => ({ ...m, [b.id]: true }));
    } catch {
      /* ignore */
    }
  }

  const grouped = BOOKING_STATUSES.map((s) => ({ status: s, items: bookings.filter((b) => b.status === s) }));

  return (
    <div className="space-y-8">
      {/* add */}
      <div>
        <button onClick={() => { setAdding((v) => !v); setMsg(''); }} className="btn-primary">
          <Plus className="h-4 w-4" /> Add inquiry
        </button>

        {adding && (
          <form onSubmit={addBooking} className="card mt-4 space-y-3 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Event">
                <input className="input w-full text-sm" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} placeholder="SHRM Annual Keynote" />
              </Field>
              <Field label="Organization">
                <input className="input w-full text-sm" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="SHRM" />
              </Field>
              <Field label="Contact name">
                <input className="input w-full text-sm" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Jamie Rivera" />
              </Field>
              <Field label="Contact email">
                <input type="email" className="input w-full text-sm" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="jamie@org.com" />
              </Field>
              <Field label="Event date">
                <input type="date" className="input w-full text-sm" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              </Field>
              <Field label="Location">
                <input className="input w-full text-sm" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="San Diego, CA" />
              </Field>
              <Field label="Fee (USD)">
                <input inputMode="numeric" className="input w-full text-sm" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="15000" />
              </Field>
            </div>
            <Field label="Notes">
              <textarea rows={2} className="input w-full resize-none text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Where it came from, topic, logistics…" />
            </Field>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className="btn-primary" style={{ padding: '9px 18px', fontSize: 'var(--text-sm)' }}>
                {busy ? 'Saving…' : 'Save inquiry'}
              </button>
              <button type="button" onClick={() => { setAdding(false); setForm({ ...EMPTY }); }} className="btn-ghost" style={{ padding: '9px 14px', fontSize: 'var(--text-sm)' }}>
                Cancel
              </button>
              {msg && <span className="text-sm" style={{ color: 'var(--danger)' }}>{msg}</span>}
            </div>
          </form>
        )}
      </div>

      {bookings.length === 0 && !adding && (
        <div className="card p-8 text-center text-sm text-muted">
          No inquiries yet. Add one by hand, or share your one-sheet so organizers can reach you — new
          inquiries land right here.
        </div>
      )}

      {/* pipeline */}
      {grouped.map(({ status, items }) =>
        items.length === 0 ? null : (
          <section key={status}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_STYLE[status].dot }} />
              <h2 className="eyebrow" style={{ marginBottom: 0 }}>{STATUS_LABEL[status]}</h2>
              <span className="text-xs text-faint">{items.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((b) => (
                <div key={b.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-strong">
                        {b.event_name || b.organization || b.contact_name}
                      </h3>
                      {(b.organization && b.event_name) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                          <Building2 className="h-3 w-3" /> {b.organization}
                        </p>
                      )}
                    </div>
                    <button onClick={() => remove(b.id)} aria-label="Remove" className="shrink-0 text-faint transition-colors hover:text-[color:var(--danger)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {fmtDate(b.event_date) && <span>{fmtDate(b.event_date)}</span>}
                    {b.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{b.location}</span>}
                    {b.fee != null && <span className="font-semibold text-strong">${b.fee.toLocaleString()}</span>}
                  </div>

                  {b.contact_email && (
                    <a href={`mailto:${b.contact_email}`} className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-link)' }}>
                      <Mail className="h-3 w-3" /> {b.contact_name || b.contact_email}
                    </a>
                  )}

                  {b.notes && <p className="mt-2 text-xs leading-relaxed text-muted">{b.notes}</p>}

                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={b.status}
                      onChange={(e) => patch(b.id, { status: e.target.value as BookingStatus })}
                      className={`rounded-[var(--radius-pill)] border-0 px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[b.status].chip}`}
                    >
                      {BOOKING_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                    {b.status === 'confirmed' && (
                      <button
                        onClick={() => toGig(b)}
                        disabled={addedGigs[b.id]}
                        className="inline-flex items-center gap-1 text-xs font-bold text-muted transition-colors hover:text-strong disabled:opacity-60"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        {addedGigs[b.id] ? 'On calendar' : 'Add to calendar'}
                      </button>
                    )}
                    {b.source === 'one_sheet' && (
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">via one-sheet</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
