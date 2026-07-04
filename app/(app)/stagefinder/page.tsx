'use client';

// Stage Finder: enter a few speakers you admire (plus your own topic), and get
// back similar speakers, the kinds of events those speakers appear at, a tailored
// pitch angle for each, and a ready-to-send outreach email. Core Premium — the
// folder layout gates the page and the API route re-checks the plan server-side.
import { useState } from 'react';
import {
  Telescope,
  Sparkles,
  Users,
  MapPin,
  Mic,
  ExternalLink,
  Send,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { SPEAKING_FORMATS, type SpeakingFormatId, type StageReport } from '@/lib/stagefinder/types';

const MAX_SPEAKERS = 5;

export default function StageFinderPage() {
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<SpeakingFormatId>('any');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StageReport | null>(null);

  function addSpeaker(name: string) {
    const clean = name.trim();
    if (!clean) return;
    if (speakers.length >= MAX_SPEAKERS) return;
    // Case-insensitive de-dupe so the same admired speaker isn't added twice.
    if (speakers.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setDraft('');
      return;
    }
    setSpeakers([...speakers, clean]);
    setDraft('');
  }

  function removeSpeaker(name: string) {
    setSpeakers(speakers.filter((s) => s !== name));
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter or comma commits the current name as a chip.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSpeaker(draft);
    } else if (e.key === 'Backspace' && !draft && speakers.length) {
      // Backspace on an empty field removes the last chip.
      removeSpeaker(speakers[speakers.length - 1]);
    }
  }

  async function findStages(e: React.FormEvent) {
    e.preventDefault();
    // Fold any half-typed name in the box into the list before sending.
    const list = draft.trim() && speakers.length < MAX_SPEAKERS ? [...speakers, draft.trim()] : speakers;
    if (list.length === 0) {
      setError('Add at least one speaker you admire.');
      return;
    }
    setSpeakers(list);
    setDraft('');
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/stagefinder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakers: list, topic: topic.trim(), format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setReport(data.report as StageReport);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !loading && (speakers.length > 0 || draft.trim().length > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Stage Finder</p>
      <h1 className="display-h1 mb-1">Find the stages your idols speak on</h1>
      <p className="mb-8 text-muted">
        Name a few speakers you admire. We&apos;ll find speakers like them, the kinds of events they
        take the stage at, and exactly how you could pitch yourself to those same rooms.
      </p>

      <form onSubmit={findStages} className="mb-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            Speakers you admire <span className="text-faint">(up to {MAX_SPEAKERS})</span>
          </label>
          <div className="input flex flex-wrap items-center gap-1.5 py-2">
            {speakers.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2.5 py-1 text-xs font-semibold text-strong"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSpeaker(s)}
                  className="text-faint transition-colors hover:text-strong"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {speakers.length < MAX_SPEAKERS && (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                onBlur={() => addSpeaker(draft)}
                placeholder={speakers.length === 0 ? 'e.g. Brené Brown, Simon Sinek…' : 'Add another…'}
                className="min-w-[140px] flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-faint">Press Enter or comma after each name.</p>
        </div>

        <div>
          <label htmlFor="sf-topic" className="mb-1.5 block text-xs font-semibold text-muted">
            What you speak about <span className="text-faint">(optional, but sharpens the match)</span>
          </label>
          <input
            id="sf-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Leadership through burnout for healthcare teams"
            className="input w-full text-sm"
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="sf-format" className="mb-1.5 block text-xs font-semibold text-muted">
              Format you want
            </label>
            <select
              id="sf-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as SpeakingFormatId)}
              className="input text-sm"
              style={{ padding: '8px 12px' }}
            >
              {SPEAKING_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={!canSubmit} className="btn-primary whitespace-nowrap">
            {loading ? 'Finding stages…' : (<><Telescope className="h-4 w-4" /> Find my stages</>)}
          </button>
        </div>
      </form>

      {error && (
        <p className="mb-6 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      )}

      {report && !loading && (
        <div className="space-y-9">
          {report.summary && (
            <div className="card p-5">
              <p className="text-xs text-faint">Your read</p>
              <p className="mt-1 text-sm text-muted">{report.summary}</p>
            </div>
          )}

          {report.speakerAppearances.length > 0 && (
            <section>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <Mic className="h-4 w-4 text-muted" /> Where your idols actually speak
              </h2>
              <p className="mb-3 text-xs text-faint">
                Pulled from a live web search — follow the source links to verify before you pitch.
              </p>
              <div className="space-y-3">
                {report.speakerAppearances.map((sa, i) => (
                  <div key={i} className="card p-5">
                    <p className="text-sm font-bold text-strong">{sa.speaker}</p>
                    <ul className="mt-3 space-y-2">
                      {sa.events.map((ev, j) => (
                        <li key={j} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold text-body">{ev.name}</span>
                          {ev.format && (
                            <span className="rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2 py-0.5 text-[11px] font-semibold text-muted">
                              {ev.format}
                            </span>
                          )}
                          {ev.sourceUrl && <SourceLink url={ev.sourceUrl} />}
                          {ev.note && <span className="w-full text-xs text-faint">{ev.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.similarSpeakers.length > 0 && (
            <section>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted" /> Speakers like the ones you admire
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {report.similarSpeakers.map((s, i) => (
                  <div key={i} className="card p-4">
                    <p className="text-sm font-bold text-strong">{s.name}</p>
                    {s.knownFor && <p className="mt-0.5 text-xs text-faint">{s.knownFor}</p>}
                    {s.whySimilar && <p className="mt-2 text-sm text-muted">{s.whySimilar}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {report.events.length > 0 && (
            <section>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted" /> Events worth pitching
              </h2>
              <div className="space-y-3">
                {report.events.map((ev, i) => (
                  <EventCard key={i} event={ev} />
                ))}
              </div>
            </section>
          )}

          {report.outreach && (
            <section>
              <h2 className="section-title mb-3 flex items-center gap-2">
                <Send className="h-4 w-4 text-muted" /> Your outreach starter
              </h2>
              <OutreachCard subject={report.outreach.subject} body={report.outreach.body} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: StageReport['events'][number] }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-strong">{event.name}</h3>
        {event.format && (
          <span className="shrink-0 rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2.5 py-0.5 text-[11px] font-bold text-muted">
            {event.format}
          </span>
        )}
      </div>
      {event.audience && <p className="mt-1 text-xs text-faint">{event.audience}</p>}
      {event.whyFit && <p className="mt-2 text-sm text-muted">{event.whyFit}</p>}

      {event.speakersSeen.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">In this world:</span>
          {event.speakersSeen.map((name, i) => (
            <span
              key={i}
              className="rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2 py-0.5 text-[11px] font-semibold text-strong"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {event.pitchAngle && (
        <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--info-bg)] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--accent-2)]">Pitch this angle</p>
          <p className="mt-0.5 text-sm text-body">{event.pitchAngle}</p>
        </div>
      )}

      {event.howToApproach && (
        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">How to get on it</p>
          <p className="mt-0.5 text-sm text-body">{event.howToApproach}</p>
        </div>
      )}

      {event.sourceUrl && (
        <div className="mt-3">
          <SourceLink url={event.sourceUrl} />
        </div>
      )}
    </div>
  );
}

// A small "Source" link out to where a fact was found on the web. Opens in a new
// tab; rel keeps us safe from tab-nabbing and passing referrer/rank to the target.
function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--accent-2)] hover:underline"
    >
      <ExternalLink className="h-3 w-3" /> Source
    </a>
  );
}

function OutreachCard({ subject, body }: { subject: string; body: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — leave the button as-is.
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Subject</p>
          <p className="truncate text-sm font-semibold text-strong">{subject}</p>
        </div>
        <button onClick={copy} className="btn-outline shrink-0 text-xs" style={{ padding: '6px 12px' }}>
          {copied ? (<><Check className="h-3.5 w-3.5" /> Copied</>) : (<><Copy className="h-3.5 w-3.5" /> Copy email</>)}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-body">{body}</p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
        <Sparkles className="h-3.5 w-3.5" /> Swap the [brackets] for your details before you send.
      </p>
    </div>
  );
}
