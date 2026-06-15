'use client';

import { useState } from 'react';
import { CalendarPlus, Link2, X, Trash2, MapPin, CalendarDays } from 'lucide-react';
import type { Gig, GigStatus } from '@/lib/gigs/types';

const STATUS_STYLES: Record<GigStatus, { label: string; bg: string; fg: string }> = {
  confirmed: { label: 'Confirmed', bg: 'var(--success)', fg: '#fff' },
  hold: { label: 'Hold', bg: 'var(--yellow-100)', fg: 'var(--yellow-600)' },
  tentative: { label: 'Tentative', bg: 'var(--ink-100)', fg: 'var(--ink-600)' },
  ticketed: { label: 'Ticketed', bg: 'var(--blue)', fg: '#fff' },
};

function monthDay(iso: string) {
  const d = new Date(iso);
  return {
    m: d.toLocaleDateString('en-US', { month: 'short' }),
    d: d.toLocaleDateString('en-US', { day: 'numeric' }),
  };
}

export function UpcomingGigs({
  initialGigs,
  initialCalendarUrl,
}: {
  initialGigs: Gig[];
  initialCalendarUrl: string | null;
}) {
  const [gigs, setGigs] = useState<Gig[]>(initialGigs);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(initialCalendarUrl);
  const [pane, setPane] = useState<'none' | 'add' | 'calendar'>('none');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // add-gig form
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<GigStatus>('confirmed');
  // calendar form
  const [icsUrl, setIcsUrl] = useState(initialCalendarUrl ?? '');

  async function refresh() {
    try {
      const res = await fetch('/api/gigs');
      if (res.ok) {
        const data = await res.json();
        setGigs(data.gigs ?? []);
        setCalendarUrl(data.calendarUrl ?? null);
      }
    } catch {
      /* keep current */
    }
  }

  async function addGig(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      setMsg('Add a title and a date.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          location,
          status,
          starts_at: new Date(`${date}T12:00:00`).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Could not save.');
      } else {
        setTitle('');
        setDate('');
        setLocation('');
        setStatus('confirmed');
        setPane('none');
        await refresh();
      }
    } catch {
      setMsg('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function connectCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!icsUrl.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/gigs/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: icsUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Could not connect.');
      } else {
        setMsg(
          data.found > 0
            ? `Connected — found ${data.found} upcoming event${data.found === 1 ? '' : 's'}.`
            : 'Connected. No upcoming events found yet.'
        );
        setPane('none');
        await refresh();
      }
    } catch {
      setMsg('Could not connect. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnectCalendar() {
    setBusy(true);
    try {
      await fetch('/api/gigs/calendar', { method: 'DELETE' });
      setIcsUrl('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeGig(id: string) {
    setGigs((g) => g.filter((x) => x.id !== id));
    try {
      await fetch(`/api/gigs/${id}`, { method: 'DELETE' });
    } catch {
      refresh();
    }
  }

  return (
    <div>
      <div className="card p-5">
        {gigs.length === 0 ? (
          <p className="text-sm text-muted">
            No gigs on the calendar yet. Add one by hand, or connect your calendar app below.
          </p>
        ) : (
          <div>
            {gigs.map((g) => {
              const { m, d } = monthDay(g.starts_at);
              const st = STATUS_STYLES[g.status];
              return (
                <div
                  key={g.id}
                  className="group flex gap-4 border-b border-[var(--border-subtle)] py-3.5 first:pt-0 last:border-none last:pb-0"
                >
                  <div className="w-12 shrink-0 text-center">
                    <div
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', color: 'var(--red)' }}
                      className="uppercase"
                    >
                      {m}
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, lineHeight: 1, color: 'var(--ink-900)' }}>
                      {d}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-[15px] font-bold text-strong">{g.title}</h4>
                    <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                      {g.location && (
                        <>
                          <MapPin className="h-3.5 w-3.5 shrink-0" /> {g.location}
                        </>
                      )}
                      {g.kind && <span>{g.location ? ' · ' : ''}{g.kind}</span>}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-bold uppercase"
                        style={{ background: st.bg, color: st.fg, letterSpacing: '0.06em' }}
                      >
                        {st.label}
                      </span>
                      {g.source === 'calendar' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                          <CalendarDays className="h-3 w-3" /> calendar
                        </span>
                      )}
                    </div>
                  </div>
                  {g.source === 'manual' && (
                    <button
                      onClick={() => removeGig(g.id)}
                      aria-label="Remove gig"
                      className="h-7 w-7 shrink-0 place-items-center rounded-full text-muted opacity-0 transition hover:bg-[var(--surface-sunk)] hover:text-strong group-hover:opacity-100 grid"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setPane(pane === 'add' ? 'none' : 'add')}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border-2 border-[var(--border-strong)] px-3.5 py-1.5 text-sm font-bold text-strong transition hover:bg-[var(--surface-sunk)]"
          >
            <CalendarPlus className="h-4 w-4" /> Add gig
          </button>
          <button
            onClick={() => setPane(pane === 'calendar' ? 'none' : 'calendar')}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 py-1.5 text-sm font-bold text-muted transition hover:text-strong"
          >
            <Link2 className="h-4 w-4" /> {calendarUrl ? 'Calendar' : 'Connect calendar'}
          </button>
        </div>

        {/* add-gig form */}
        {pane === 'add' && (
          <form onSubmit={addGig} className="mt-4 space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
            <input className="input w-full text-sm" placeholder="Talk / event title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-2">
              <input type="date" className="input w-full text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
              <select className="input text-sm" value={status} onChange={(e) => setStatus(e.target.value as GigStatus)}>
                <option value="confirmed">Confirmed</option>
                <option value="hold">Hold</option>
                <option value="tentative">Tentative</option>
                <option value="ticketed">Ticketed</option>
              </select>
            </div>
            <input className="input w-full text-sm" placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-primary w-full" style={{ padding: '9px 18px', fontSize: 'var(--text-sm)' }}>
              {busy ? 'Saving…' : 'Add to calendar'}
            </button>
          </form>
        )}

        {/* calendar connect */}
        {pane === 'calendar' && (
          <form onSubmit={connectCalendar} className="mt-4 space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
            <p className="text-xs text-muted">
              Paste the secret iCal/ICS address from Google, Outlook, or Apple Calendar — we’ll show your
              upcoming events here.
            </p>
            <input
              className="input w-full text-sm"
              placeholder="https://calendar.google.com/…/basic.ics"
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-ink flex-1" style={{ padding: '9px 18px', fontSize: 'var(--text-sm)' }}>
                {busy ? 'Connecting…' : calendarUrl ? 'Update' : 'Connect'}
              </button>
              {calendarUrl && (
                <button type="button" onClick={disconnectCalendar} disabled={busy} className="btn-ghost" style={{ padding: '9px 14px', fontSize: 'var(--text-sm)' }}>
                  <X className="h-4 w-4" /> Disconnect
                </button>
              )}
            </div>
          </form>
        )}

        {msg && <p className="mt-3 text-xs text-muted">{msg}</p>}
      </div>
    </div>
  );
}
