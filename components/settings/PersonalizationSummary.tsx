'use client';

// "What the AI knows about you" — the Brand Kit side of personalization. Shows
// the persona every AI tool now reads (name, website, signature topics, bio,
// voice) so the user can see why results feel personal, and steer it. The memory
// side (add/edit/forget individual facts) lives just below in MemorySettings.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ExternalLink, Lightbulb, FileText, Mic } from 'lucide-react';

interface Persona {
  name: string | null;
  websiteUrl: string | null;
  topics: string[];
  bio: string;
  tone: string;
  hasAiProfile: boolean;
  memoryCount: number;
  hasAny: boolean;
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-faint">{label}</p>
        <div className="mt-0.5 text-sm text-body">{children}</div>
      </div>
    </div>
  );
}

export function PersonalizationSummary() {
  const [p, setP] = useState<Persona | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/personalization')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setP(d as Persona);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) {
    return <div className="h-40 animate-pulse rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)]" />;
  }

  const hasBrand = Boolean(p && (p.name || p.websiteUrl || p.topics.length || p.bio || p.tone || p.hasAiProfile));

  return (
    <div className="card space-y-5 p-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-strong">
          <Sparkles className="h-4 w-4 text-muted" /> What the AI knows about you
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Every tool — your SEO tips, Stage Finder, Content Ideas, keynote tailoring, the assistant —
          reads this so its results fit you, not a generic speaker.
        </p>
      </div>

      {!hasBrand ? (
        <div className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunk)] p-4">
          <p className="text-sm font-semibold text-strong">Make it yours</p>
          <p className="mt-1 text-xs text-muted">
            Add your website when you brand your hub and we&apos;ll pull in your name, topics, bio, and
            voice automatically — then every tool gets personal. You can also just tell us things below.
          </p>
          <Link
            href="/settings"
            className="mt-3 inline-block text-sm font-semibold hover:underline"
            style={{ color: 'var(--text-link)' }}
          >
            Brand your hub →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {p?.name && (
            <Row icon={<Mic className="h-4 w-4" />} label="You">
              {p.name}
            </Row>
          )}
          {p?.websiteUrl && (
            <Row icon={<ExternalLink className="h-4 w-4" />} label="Website">
              <a
                href={p.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all hover:underline"
                style={{ color: 'var(--text-link)' }}
              >
                {p.websiteUrl}
              </a>
            </Row>
          )}
          {!!p?.topics.length && (
            <Row icon={<Lightbulb className="h-4 w-4" />} label="Signature topics">
              <div className="flex flex-wrap gap-1.5">
                {p.topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2 py-0.5 text-xs font-semibold text-strong"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Row>
          )}
          {p?.tone && (
            <Row icon={<Sparkles className="h-4 w-4" />} label="Voice">
              {p.tone}
            </Row>
          )}
          {p?.bio && (
            <Row icon={<FileText className="h-4 w-4" />} label="Bio">
              <p className="line-clamp-4">{p.bio}</p>
            </Row>
          )}
          <Row icon={<FileText className="h-4 w-4" />} label="Remembered about you">
            {p?.hasAiProfile ? 'Your speaker profile' : 'No speaker profile yet'}
            {typeof p?.memoryCount === 'number' ? ` · ${p.memoryCount} remembered fact${p.memoryCount === 1 ? '' : 's'}` : ''}
          </Row>
          <p className="text-xs text-faint">
            This comes from your hub branding. To change it,{' '}
            <Link href="/settings" className="font-semibold hover:underline" style={{ color: 'var(--text-link)' }}>
              update your hub
            </Link>
            . Add or remove individual facts below.
          </p>
        </div>
      )}
    </div>
  );
}
