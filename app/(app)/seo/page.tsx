'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
} from 'lucide-react';
import { ScoreRing } from '@/components/ScoreRing';
import type { AuditResult, AuditCheck, CheckStatus } from '@/lib/seo/audit';
import type { SeoTip } from '@/app/api/seo-audit/route';

const STATUS_META: Record<CheckStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: 'var(--success)', label: 'Pass' },
  warn: { icon: AlertTriangle, color: 'var(--score-mid, #f59e0b)', label: 'Improve' },
  fail: { icon: XCircle, color: 'var(--danger)', label: 'Fix' },
};

const PRIORITY_ORDER: Record<SeoTip['priority'], number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLE: Record<SeoTip['priority'], string> = {
  high: 'bg-[var(--danger)] text-white',
  medium: 'bg-[color:var(--score-mid,#f59e0b)] text-white',
  low: 'bg-[var(--ink-200)] text-strong',
};

const AREA_LABEL: Record<SeoTip['area'], string> = { seo: 'SEO', aeo: 'AEO', both: 'SEO + AEO' };

function CheckRow({ check }: { check: AuditCheck }) {
  const meta = STATUS_META[check.status];
  const Icon = meta.icon;
  return (
    <div className="flex gap-3 py-3">
      <Icon className="h-5 w-5 shrink-0" style={{ color: meta.color }} strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-strong">{check.title}</p>
        <p className="mt-0.5 text-sm text-muted">{check.detail}</p>
      </div>
    </div>
  );
}

export default function SeoAuditPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [tips, setTips] = useState<SeoTip[]>([]);

  async function handleAudit() {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError('');
    setAudit(null);
    setTips([]);
    try {
      const res = await fetch('/api/seo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setAudit(data.audit);
      setTips((data.tips ?? []).sort((a: SeoTip, b: SeoTip) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]));
    } catch {
      setError('Network error. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  }

  const seoChecks = audit?.checks.filter((c) => c.area === 'seo') ?? [];
  const aeoChecks = audit?.checks.filter((c) => c.area === 'aeo') ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> Back to hub
      </Link>

      <p className="eyebrow mb-2">SEO &amp; AEO Audit</p>
      <h1 className="text-2xl font-extrabold text-strong">Make your site easy to find — and easy to cite</h1>
      <p className="mt-2 text-muted">
        Drop in any page and we&apos;ll read it the way Google and AI answer engines do, then hand you a
        prioritized list of fixes for both search ranking (SEO) and AI citability (AEO).
      </p>

      {/* Input */}
      <div className="card mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
            placeholder="yourwebsite.com/page"
            className="input w-full pl-9 text-sm"
          />
        </div>
        <button onClick={handleAudit} disabled={loading || !url.trim()} className="btn-primary inline-flex items-center justify-center gap-2">
          {loading ? 'Analyzing…' : (<><Search className="h-4 w-4" /> Audit</>)}
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-[color:var(--danger)]">{error}</p>}

      {loading && (
        <p className="mt-6 text-sm text-muted">
          Fetching the page, checking on-page signals, and writing your tips…
        </p>
      )}

      {audit && (
        <div className="mt-8 space-y-8">
          {/* Scores */}
          <div className="card flex items-center justify-around gap-4 p-6">
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={audit.seoScore} />
              <span className="text-xs font-bold uppercase tracking-wide text-muted">SEO</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={audit.aeoScore} />
              <span className="text-xs font-bold uppercase tracking-wide text-muted">AEO</span>
            </div>
            <p className="max-w-[40%] text-xs text-faint">
              Audited <span className="font-semibold text-muted">{audit.finalUrl}</span>. Scores weight passes fully and
              warnings half.
            </p>
          </div>

          {/* Prioritized tips */}
          {tips.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-strong">
                <Sparkles className="h-5 w-5 text-[color:var(--signature)]" /> Top recommendations
              </h2>
              <div className="mt-4 space-y-3">
                {tips.map((tip, i) => (
                  <div key={i} className="card p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${PRIORITY_STYLE[tip.priority]}`}>
                        {tip.priority}
                      </span>
                      <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-bold uppercase text-muted">
                        {AREA_LABEL[tip.area]}
                      </span>
                      <h3 className="text-sm font-extrabold text-strong">{tip.title}</h3>
                    </div>
                    {tip.why && <p className="text-sm text-muted">{tip.why}</p>}
                    <p className="mt-1 text-sm text-body">
                      <span className="font-semibold text-strong">How: </span>
                      {tip.how}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Detailed checks */}
          <section className="grid gap-6 sm:grid-cols-2">
            <div className="card p-5">
              <h2 className="text-base font-extrabold text-strong">Search engine optimization</h2>
              <p className="mb-1 text-xs text-muted">How well classic crawlers can rank this page.</p>
              <div className="divide-y divide-[var(--border-subtle)]">
                {seoChecks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h2 className="text-base font-extrabold text-strong">Answer engine optimization</h2>
              <p className="mb-1 text-xs text-muted">How well AI assistants can understand &amp; cite this page.</p>
              <div className="divide-y divide-[var(--border-subtle)]">
                {aeoChecks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
