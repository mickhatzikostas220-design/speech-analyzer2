'use client';

// SEO & AEO tool: enter a website URL, get tips for ranking on search engines
// and being cited by AI answer engines.
import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

interface TipItem {
  title: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
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

function TipList({ title, items }: { title: string; items: TipItem[] }) {
  return (
    <section>
      <h2 className="section-title mb-3">{title}</h2>
      <div className="space-y-3">
        {items.map((t, i) => (
          <div key={i} className="card p-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-strong">{t.title}</p>
              <span className={`shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-bold ${SEVERITY[t.severity]?.cls ?? SEVERITY.low.cls}`}>
                {SEVERITY[t.severity]?.label ?? 'Tip'}
              </span>
            </div>
            <p className="text-sm text-muted">{t.detail}</p>
          </div>
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
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setReport(data.report as Report);
        setAnalyzedUrl(data.url as string);
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
        Drop in your website and get specific tips to rank in search (SEO) and get cited by AI answer
        engines like ChatGPT and Perplexity (AEO).
      </p>

      <form onSubmit={analyze} className="mb-8 flex flex-col gap-3 sm:flex-row">
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
      </form>

      {error && (
        <p className="mb-6 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
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
          {report.seo?.length > 0 && <TipList title="Search engine optimization (SEO)" items={report.seo} />}
          {report.aeo?.length > 0 && <TipList title="Answer engine optimization (AEO)" items={report.aeo} />}
        </div>
      )}
    </div>
  );
}
