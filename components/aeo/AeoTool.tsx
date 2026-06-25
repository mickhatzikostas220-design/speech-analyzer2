'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';

interface AeoResult {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  faq: { question: string; answer: string }[];
  jsonLd: Record<string, unknown>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-strong"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function AeoTool({ speakerName }: { speakerName: string }) {
  const [talkTitle, setTalkTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AeoResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/aeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talkTitle, topic, audience, speakerName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const jsonLdString = result ? JSON.stringify(result.jsonLd, null, 2) : '';

  return (
    <div className="space-y-8">
      <form onSubmit={run} className="card space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-semibold text-strong">Talk title</label>
          <input
            value={talkTitle}
            onChange={(e) => setTalkTitle(e.target.value)}
            required
            placeholder="e.g. Leading Through Uncertainty"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-strong">Topic / description</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            rows={3}
            placeholder="What the talk covers and the outcome for the audience."
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-strong">
            Target audience <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. corporate leadership teams, HR conferences"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-surface-card px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          <Sparkles className="h-4 w-4" />
          {loading ? 'Generating…' : 'Generate AEO/SEO pack'}
        </button>
        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </form>

      {result && (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-strong">Meta title</h3>
              <CopyButton value={result.metaTitle} />
            </div>
            <p className="text-sm text-body">{result.metaTitle}</p>
          </div>

          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-strong">Meta description</h3>
              <CopyButton value={result.metaDescription} />
            </div>
            <p className="text-sm text-body">{result.metaDescription}</p>
          </div>

          <div className="card p-5">
            <h3 className="mb-2 text-sm font-extrabold text-strong">Keywords</h3>
            <div className="flex flex-wrap gap-2">
              {result.keywords.map((k) => (
                <span key={k} className="rounded-full bg-[var(--ink-100)] px-2.5 py-1 text-xs font-semibold text-strong">
                  {k}
                </span>
              ))}
            </div>
          </div>

          {result.faq.length > 0 && (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-extrabold text-strong">Answer-engine FAQ</h3>
              <div className="space-y-3">
                {result.faq.map((f) => (
                  <div key={f.question}>
                    <p className="text-sm font-semibold text-strong">{f.question}</p>
                    <p className="text-sm text-muted">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-strong">JSON-LD structured data</h3>
              <CopyButton value={jsonLdString} />
            </div>
            <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-sunk)] p-3 text-xs text-body">
              {jsonLdString}
            </pre>
            <p className="mt-2 text-xs text-muted">
              Paste this into the <code>&lt;head&gt;</code> of your talk page (inside a{' '}
              <code>&lt;script type=&quot;application/ld+json&quot;&gt;</code> tag) so search and answer
              engines can index it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
