'use client';

// SeoChat: the premium SEO/GEO/AEO assistant that sits at the bottom of the SEO
// tool. Free users see a locked upgrade card; paid users can chat about their
// website. It streams answers from /api/seo/chat and passes along the most
// recent scan (url + on-page signals + sourced tips) so the bot can reference
// real data about the speaker's site.
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Lock, Sparkles } from 'lucide-react';

interface SiteContext {
  url?: string;
  signals?: Record<string, unknown> | null;
  report?: { summary?: string; seo?: unknown[]; aeo?: unknown[] } | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'How can I rank higher on Google?',
  'Will AI assistants like ChatGPT cite my site?',
  'What should I fix first?',
];

export default function SeoChat({ context }: { context: SiteContext }) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null); // null = still checking
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Check the user's plan up front so we can show the locked or unlocked state
  // before they ever send a message.
  useEffect(() => {
    let active = true;
    fetch('/api/seo/chat')
      .then((r) => (r.ok ? r.json() : { unlocked: false }))
      .then((d) => active && setUnlocked(Boolean(d.unlocked)))
      .catch(() => active && setUnlocked(false));
    return () => {
      active = false;
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/seo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          context: {
            url: context.url || undefined,
            signals: context.signals || undefined,
            report: context.report || undefined,
          },
        }),
      });

      if (res.status === 403) {
        setUnlocked(false);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || `Error ${res.status}`);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => [...prev.slice(0, -1), { role: 'assistant', content: assistantText }]);
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  // While we don't yet know the plan, keep the footprint small.
  if (unlocked === null) {
    return (
      <section className="mt-10">
        <div className="card h-28 animate-pulse bg-[var(--surface-sunk)]" />
      </section>
    );
  }

  // Locked: free users get an upgrade prompt instead of the chat.
  if (!unlocked) {
    return (
      <section className="mt-10">
        <h2 className="section-title mb-3">SEO assistant</h2>
        <a
          href="/settings/plans"
          className="card flex items-center justify-between gap-4 p-5 transition hover:border-strong"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunk)]">
              <Lock className="h-4 w-4 text-muted" />
            </span>
            <div>
              <p className="font-bold text-strong">Chat with the SEO &amp; AEO assistant</p>
              <p className="mt-0.5 text-sm text-muted">
                Ask anything about your website — what to fix, how to rank on Google, and how to get
                cited by AI answer engines. Upgrade to unlock the assistant.
              </p>
            </div>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-muted" />
        </a>
      </section>
    );
  }

  // Unlocked: full chat.
  return (
    <section className="mt-10">
      <h2 className="section-title mb-3">SEO assistant</h2>
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-signature">
            <MessageSquare className="h-3 w-3 text-on-signature" />
          </span>
          <h3 className="text-sm font-medium text-body">
            Ask about your website{context.url ? ` (${context.url})` : ''}
          </h3>
        </div>

        <div className="mb-3 max-h-96 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="space-y-2 py-6 text-center">
              <p className="text-sm text-muted">
                Ask anything about your site&apos;s SEO, GEO, or AEO.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunk)] px-3 py-1.5 text-xs text-body transition-colors hover:bg-[var(--ink-200)]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--radius-sm)] px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-signature text-on-signature' : 'bg-[var(--surface-sunk)] text-body'
                }`}
              >
                {msg.content || <span className="animate-pulse opacity-40">Thinking…</span>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your website…"
            disabled={loading}
            className="input flex-1 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary flex-shrink-0 text-sm !px-4 !py-2"
          >
            {loading ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </section>
  );
}
