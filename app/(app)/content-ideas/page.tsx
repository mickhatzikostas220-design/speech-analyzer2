'use client';

// Content Ideas: generate 20–30 blog / video / short titles that answer things
// people actually search for AND sound like the speaker's brand voice. We read
// the speaker's expertise + tone from their brand kit server-side, so the form is
// optional — hit Generate and go, or steer it with a topic / voice / format.
// Core Premium — the folder layout gates the page and the API re-checks the plan.
import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Sparkles, Copy, Check, FileText, Video, Zap } from 'lucide-react';
import {
  CONTENT_FORMATS,
  contentFormatLabel,
  type ContentFormatId,
  type ContentIdea,
  type ContentIdeaReport,
} from '@/lib/contentideas/types';
import { ToolRunHistory } from '@/components/ToolRunHistory';
import { loadLocalRun, saveLocalRun, fetchLatestRun, type ToolRunSummary } from '@/lib/toolRuns/client';

// What we persist per run — locally for instant repaint + on the server (via
// /api/content-ideas) for cross-device durability.
interface SavedIdeas {
  report?: ContentIdeaReport | null;
}

const FORMAT_ICON: Record<ContentFormatId, typeof FileText> = {
  blog: FileText,
  video: Video,
  short: Zap,
};

export default function ContentIdeasPage() {
  const [topic, setTopic] = useState('');
  const [voice, setVoice] = useState('');
  const [formatBias, setFormatBias] = useState<'all' | ContentFormatId>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ContentIdeaReport | null>(null);
  const [filter, setFilter] = useState<'all' | ContentFormatId>('all');
  const [copiedAll, setCopiedAll] = useState(false);
  const [runHistory, setRunHistory] = useState<ToolRunSummary[]>([]);

  // Rehydrate from a saved run (local cache or a server record).
  function hydrate(saved: SavedIdeas) {
    if (!saved?.report) return;
    setReport(saved.report);
    setFilter('all');
  }

  async function refreshHistory() {
    const res = await fetchLatestRun<SavedIdeas>('content_ideas');
    if (!res) return;
    setRunHistory(
      res.latest
        ? [{ id: res.latest.id, title: res.latest.title, created_at: res.latest.created_at }, ...res.history]
        : res.history
    );
  }

  // On mount: instant repaint from local cache, then the durable server copy
  // (cross-device) plus the recent-run history.
  useEffect(() => {
    const local = loadLocalRun<SavedIdeas>('content_ideas');
    if (local) hydrate(local);
    let active = true;
    fetchLatestRun<SavedIdeas>('content_ideas').then((res) => {
      if (!active || !res) return;
      if (res.latest?.output) hydrate(res.latest.output as SavedIdeas);
      setRunHistory(
        res.latest
          ? [{ id: res.latest.id, title: res.latest.title, created_at: res.latest.created_at }, ...res.history]
          : res.history
      );
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);
    setFilter('all');
    try {
      const res = await fetch('/api/content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), voice: voice.trim(), format: formatBias }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        const nextReport = data.report as ContentIdeaReport;
        setReport(nextReport);
        saveLocalRun<SavedIdeas>('content_ideas', { report: nextReport });
        void refreshHistory();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: report?.ideas.length ?? 0 };
    for (const f of CONTENT_FORMATS) c[f.id] = report?.ideas.filter((i) => i.format === f.id).length ?? 0;
    return c;
  }, [report]);

  const shown = useMemo(
    () => (report ? report.ideas.filter((i) => filter === 'all' || i.format === filter) : []),
    [report, filter]
  );

  async function copyAll() {
    if (!report) return;
    const text = report.ideas
      .map((i) => `• ${i.title}  [${contentFormatLabel(i.format)}]  — ${i.keyword}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Content Ideas</p>
      <h1 className="display-h1 mb-1">Titles people search for — in your voice</h1>
      <p className="mb-8 text-muted">
        Get 20–30 blog, video, and short titles that fit your expertise and answer what people
        actually search for. We pull in your brand voice automatically — steer it below if you want.
      </p>

      <form onSubmit={generate} className="mb-8 space-y-4">
        <div>
          <label htmlFor="ci-topic" className="mb-1.5 block text-xs font-semibold text-muted">
            Topic or focus <span className="text-faint">(optional — defaults to your brand topics)</span>
          </label>
          <input
            id="ci-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Psychological safety for engineering teams"
            className="input w-full text-sm"
          />
        </div>

        <div>
          <label htmlFor="ci-voice" className="mb-1.5 block text-xs font-semibold text-muted">
            Brand voice <span className="text-faint">(optional — defaults to your brand tone)</span>
          </label>
          <input
            id="ci-voice"
            type="text"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder="e.g. Snarky and funny, but genuinely useful"
            className="input w-full text-sm"
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="ci-format" className="mb-1.5 block text-xs font-semibold text-muted">
              Lean toward
            </label>
            <select
              id="ci-format"
              value={formatBias}
              onChange={(e) => setFormatBias(e.target.value as 'all' | ContentFormatId)}
              className="input text-sm"
              style={{ padding: '8px 12px' }}
            >
              <option value="all">A mix of everything</option>
              {CONTENT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}s
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap">
            {loading ? 'Thinking up ideas…' : (<><Lightbulb className="h-4 w-4" /> Generate ideas</>)}
          </button>
        </div>
      </form>

      {error && (
        <p className="mb-6 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <ToolRunHistory tool="content_ideas" items={runHistory} onLoad={(out) => hydrate(out as SavedIdeas)} label="Recent batches" />

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      )}

      {report && !loading && (
        <div className="space-y-6">
          {report.summary && (
            <div className="card p-5">
              <p className="text-xs text-faint">The strategy</p>
              <p className="mt-1 text-sm text-muted">{report.summary}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(['all', 'blog', 'video', 'short'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-semibold transition-colors ${
                    filter === id
                      ? 'border-transparent bg-signature text-on-signature'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-sunk)] text-muted hover:text-strong'
                  }`}
                >
                  {id === 'all' ? 'All' : `${contentFormatLabel(id)}s`} ({counts[id] ?? 0})
                </button>
              ))}
            </div>
            <button onClick={copyAll} className="btn-outline text-xs" style={{ padding: '6px 12px' }}>
              {copiedAll ? (<><Check className="h-3.5 w-3.5" /> Copied</>) : (<><Copy className="h-3.5 w-3.5" /> Copy all</>)}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((idea, i) => (
              <IdeaCard key={i} idea={idea} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: ContentIdea }) {
  const [copied, setCopied] = useState(false);
  const Icon = FORMAT_ICON[idea.format] ?? FileText;

  async function copy() {
    try {
      await navigator.clipboard.writeText(idea.title);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
          <Icon className="h-3 w-3" /> {contentFormatLabel(idea.format)}
        </span>
        <button
          onClick={copy}
          aria-label="Copy title"
          className="text-faint transition-colors hover:text-strong"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="text-sm font-bold text-strong">{idea.title}</p>
      {idea.angle && <p className="mt-1.5 text-xs text-muted">{idea.angle}</p>}
      {idea.keyword && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-faint">
          <Sparkles className="h-3 w-3" /> Searches for: <span className="font-medium text-muted">{idea.keyword}</span>
        </p>
      )}
    </div>
  );
}
