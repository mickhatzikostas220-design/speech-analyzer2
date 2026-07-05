'use client';

// SEO & AEO tool: enter a website URL, get step-by-step tips for ranking on
// search engines and being cited by AI answer engines. Free users get one tip
// a week; paid users see every tip and can save fixes to their tip plan.
import { useState } from 'react';
import { Search, Sparkles, Check, CalendarPlus, Copy, Code2 } from 'lucide-react';
import { SEO_PLATFORMS, type SeoPlatformId } from '@/lib/seo/platforms';
import SeoChat from './SeoChat';

interface TipItem {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  steps: string[];
  /** Optional ready-to-paste artifact (JSON-LD, HTML, llms.txt, …). */
  code?: string;
  codeLang?: string;
}
interface Report {
  summary: string;
  seo: TipItem[];
  aeo: TipItem[];
}

const SEVERITY: Record<string, { label: string; cls: string }> = {
  high: { label: 'High impact', cls: 'bg-[var(--danger-bg)] text-[color:var(--danger)]' },
  medium: { label: 'Medium', cls: 'bg-[var(--warning-bg)] text-[#8A6D00]' },
  low: { label: 'Nice to have', cls: 'bg-[var(--info-bg)] text-[color:var(--accent-2)]' },
};

// A ready-to-paste artifact (JSON-LD, HTML, llms.txt) with a copy button — the
// thing that makes an AEO tip actionable instead of abstract.
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — leave the button as-is.
    }
  }
  return (
    <div className="mt-3 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--ink-900)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pink-200)]">
          <Code2 className="h-3.5 w-3.5" /> Paste this{lang ? ` · ${lang}` : ''}
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--pink-200)] transition-opacity hover:opacity-80"
        >
          {copied ? (<><Check className="h-3.5 w-3.5" /> Copied</>) : (<><Copy className="h-3.5 w-3.5" /> Copy</>)}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto p-3 text-[12px] leading-relaxed text-[var(--paper)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TipCard({ tip, canSave }: { tip: TipItem; canSave: boolean }) {
  const [date, setDate] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const today = new Date().toISOString().slice(0, 10);

  async function save() {
    setState('saving');
    const body = [tip.detail, '', ...tip.steps.map((s, i) => `${i + 1}. ${s}`)].join('\n');
    try {
      const res = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'seo', title: tip.title, body, scheduled_for: date || null }),
      });
      setState(res.ok ? 'saved' : 'idle');
    } catch {
      // Network error — don't leave the button stuck on "Saving…".
      setState('idle');
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-strong">{tip.title}</p>
        <span className={`shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-bold ${SEVERITY[tip.severity]?.cls ?? SEVERITY.low.cls}`}>
          {SEVERITY[tip.severity]?.label ?? 'Tip'}
        </span>
      </div>
      <p className="text-sm text-muted">{tip.detail}</p>

      {tip.steps?.length > 0 && (
        <ol className="mt-3 space-y-1.5">
          {tip.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-body">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunk)] text-[11px] font-bold text-strong">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {tip.code && <CodeBlock code={tip.code} lang={tip.codeLang} />}

      {canSave && (
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
          {state === 'saved' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--success)]">
              <Check className="h-4 w-4" /> Added to your plan
            </span>
          ) : (
            <>
              <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="input text-xs" style={{ padding: '6px 10px' }} />
              <button onClick={save} disabled={state === 'saving'} className="btn-outline text-xs" style={{ padding: '6px 12px' }}>
                <CalendarPlus className="h-3.5 w-3.5" /> {state === 'saving' ? 'Saving…' : 'Add to plan'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TipSection({ title, items, canSave }: { title: string; items: TipItem[]; canSave: boolean }) {
  return (
    <section>
      <h2 className="section-title mb-3">{title}</h2>
      <div className="space-y-3">
        {items.map((t, i) => (
          <TipCard key={i} tip={t} canSave={canSave} />
        ))}
      </div>
    </section>
  );
}

export default function SeoPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [analyzedUrl, setAnalyzedUrl] = useState('');
  const [signals, setSignals] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [platform, setPlatform] = useState<SeoPlatformId>('custom');

  const isPaid = plan !== 'free';

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setReport(data.report as Report);
        setAnalyzedUrl(data.url as string);
        setSignals((data.signals as Record<string, unknown>) ?? null);
        setPlan((data.plan as string) ?? 'free');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">SEO &amp; AEO</p>
      <h1 className="display-h1 mb-1">Get found — on Google and in AI answers</h1>
      <p className="mb-8 text-muted">
        Drop in your website and get step-by-step tips to rank in search (SEO) and get cited by AI
        answer engines like ChatGPT and Perplexity (AEO).
      </p>

      <form onSubmit={analyze} className="mb-8 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourwebsite.com"
              className="input w-full pl-9 text-sm"
            />
          </div>
          <button type="submit" disabled={loading || !url.trim()} className="btn-primary whitespace-nowrap">
            {loading ? 'Analyzing…' : (<><Sparkles className="h-4 w-4" /> Get tips</>)}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="seo-platform" className="text-xs font-semibold text-muted">
            My site is built with:
          </label>
          <select
            id="seo-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SeoPlatformId)}
            className="input text-sm"
            style={{ padding: '6px 10px' }}
          >
            {SEO_PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <span className="text-xs text-faint">so the steps match your editor</span>
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
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      )}

      {report && !loading && (
        <div className="space-y-8">
          <div className="card p-5">
            <p className="text-xs text-faint">Analyzed</p>
            <p className="mb-2 break-all text-sm font-semibold text-strong">{analyzedUrl}</p>
            <p className="text-sm text-muted">{report.summary}</p>
          </div>

          {report.seo?.length > 0 && <TipSection title="Search engine optimization (SEO)" items={report.seo} canSave={isPaid} />}
          {report.aeo?.length > 0 && <TipSection title="Answer engine optimization (AEO)" items={report.aeo} canSave={isPaid} />}

          {!isPaid && (
            <a
              href="/settings/plans"
              className="card flex items-center justify-between gap-4 p-5 transition hover:border-strong"
            >
              <div>
                <p className="font-bold text-strong">That's your free tip for this week.</p>
                <p className="mt-0.5 text-sm text-muted">
                  Upgrade for unlimited SEO checks, every tip from each scan, and the ability to save
                  fixes to your plan and check them off.
                </p>
              </div>
              <Sparkles className="h-5 w-5 shrink-0 text-muted" />
            </a>
          )}
        </div>
      )}

      {/* SEO/GEO/AEO chatbot — premium-only; locked for free users. */}
      <SeoChat context={{ url: analyzedUrl, signals, report }} />
    </div>
  );
}
