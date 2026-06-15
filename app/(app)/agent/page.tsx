'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import type { AgentEvent, SideEffect } from '@/lib/agent/types';

interface ToolCard {
  label: string;
  sideEffect: SideEffect;
  ok?: boolean;
  summary?: string;
}
interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  tools: ToolCard[];
}
interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

function effectBadge(effect: SideEffect) {
  if (effect === 'irreversible') return { text: 'sends', cls: 'bg-red-500/15 text-red-300' };
  if (effect === 'reversible') return { text: 'draft', cls: 'bg-amber-500/15 text-amber-300' };
  return { text: 'read', cls: 'bg-zinc-700/40 text-zinc-400' };
}

export default function AgentPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch('/api/agent/conversations');
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function openConversation(id: string) {
    setActiveId(id);
    setError(null);
    const res = await fetch(`/api/agent/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(
      (data.messages as { role: 'user' | 'assistant'; content: string }[]).map((m) => ({
        role: m.role,
        content: m.content,
        tools: [],
      }))
    );
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  // Apply a streamed event to the in-progress assistant message (always last).
  function applyEvent(event: AgentEvent) {
    if (event.type === 'text') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: last.content + event.delta };
        return next;
      });
    } else if (event.type === 'tool') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          tools: [...last.tools, { label: event.label, sideEffect: event.sideEffect }],
        };
        return next;
      });
    } else if (event.type === 'tool_result') {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        const tools = [...last.tools];
        for (let i = tools.length - 1; i >= 0; i--) {
          if (tools[i].ok === undefined) {
            tools[i] = { ...tools[i], ok: event.ok, summary: event.summary };
            break;
          }
        }
        next[next.length - 1] = { ...last, tools };
        return next;
      });
    } else if (event.type === 'error') {
      setError(event.message);
    } else if (event.type === 'done') {
      setActiveId(event.conversationId);
      loadConversations();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, tools: [] },
      { role: 'assistant', content: '', tools: [] },
    ]);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, message: text }),
      });

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Request failed.');
        setSending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            try {
              applyEvent(JSON.parse(line) as AgentEvent);
            } catch {
              /* ignore malformed line */
            }
          }
        }
      }
    } catch {
      setError('Connection interrupted.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 flex gap-6 h-[calc(100vh-3.5rem)]">
      {/* Conversation sidebar */}
      <aside className="hidden md:flex w-56 flex-col gap-2 shrink-0">
        <button
          onClick={newChat}
          className="text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg py-2 transition-colors"
        >
          + New chat
        </button>
        <Link
          href="/agent/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 text-center py-1"
        >
          Settings & connected apps →
        </Link>
        <div className="mt-2 overflow-y-auto space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg truncate transition-colors ${
                activeId === c.id
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>

      {/* Chat panel */}
      <section className="flex-1 flex flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-300">Your personal assistant</p>
              <p className="text-xs mt-1 max-w-xs">
                Ask about your speech analyses, draft emails, or connect apps in Settings.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                }`}
              >
                {m.tools.map((t, ti) => {
                  const badge = effectBadge(t.sideEffect);
                  return (
                    <div
                      key={ti}
                      className="mb-2 text-xs flex items-center gap-2 bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5"
                    >
                      <span className={`px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                      <span className="text-zinc-400 truncate">{t.label}</span>
                      {t.ok === undefined ? (
                        <span className="text-zinc-600 ml-auto animate-pulse">…</span>
                      ) : (
                        <span className={`ml-auto ${t.ok ? 'text-green-400' : 'text-red-400'}`}>
                          {t.ok ? '✓' : '✕'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {m.content || (m.role === 'assistant' && sending && i === messages.length - 1 ? (
                  <span className="text-zinc-600">…</span>
                ) : null)}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}{' '}
            <Link href="/agent/settings" className="underline">
              Open settings
            </Link>
          </div>
        )}

        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message your assistant…"
            className="flex-1 resize-none bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 max-h-40"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl px-4 py-3 text-sm transition-colors"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  );
}
