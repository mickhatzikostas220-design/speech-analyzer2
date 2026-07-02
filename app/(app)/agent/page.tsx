'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { Bot, Trash2 } from 'lucide-react';
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
  if (effect === 'irreversible')
    return { text: 'sends', cls: 'bg-[var(--danger-bg)] text-[color:var(--danger)]' };
  if (effect === 'reversible') return { text: 'draft', cls: 'bg-[var(--warning-bg)] text-[#8A6D00]' };
  return { text: 'read', cls: 'bg-[var(--surface-sunk)] text-muted' };
}

export default function AgentPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

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

  // Close the delete-confirmation modal on Escape, and move focus onto Cancel
  // when it opens — standard a11y for a destructive dialog.
  useEffect(() => {
    if (!deleteTarget) return;
    cancelBtnRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDeleteTarget(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget]);

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

  async function confirmDeleteConversation() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    setConversations((prev) => prev.filter((c) => c.id !== target.id));
    if (activeId === target.id) newChat();
    try {
      await fetch(`/api/agent/conversations/${target.id}`, { method: 'DELETE' });
    } catch {
      loadConversations();
    }
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
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-5xl gap-6 px-4 py-6">
      {/* Conversation sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col gap-2 md:flex">
        <button onClick={newChat} className="btn-primary w-full justify-center" style={{ padding: '9px 16px', fontSize: 'var(--text-sm)' }}>
          + New chat
        </button>
        <Link href="/agent/settings" className="py-1 text-center text-xs text-muted transition-colors hover:text-strong">
          Settings &amp; connected apps →
        </Link>
        <div className="mt-2 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-[var(--radius-sm)] pr-1 transition-colors ${
                activeId === c.id ? 'bg-[var(--surface-sunk)]' : 'hover:bg-[var(--surface-sunk)]'
              }`}
            >
              <button
                onClick={() => openConversation(c.id)}
                className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                  activeId === c.id ? 'font-semibold text-strong' : 'text-muted'
                }`}
              >
                {c.title}
              </button>
              <button
                onClick={() => setDeleteTarget(c)}
                aria-label="Delete chat"
                title="Delete chat"
                className="shrink-0 rounded p-1 text-faint opacity-0 transition hover:text-[color:var(--danger)] focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat panel */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--signature)]">
                <Bot className="h-6 w-6" style={{ color: 'var(--on-signature)' }} strokeWidth={2.25} />
              </div>
              <p className="text-sm font-semibold text-strong">Your personal assistant</p>
              <p className="mt-1 max-w-xs text-xs">
                Ask about your speech analyses, draft emails, or connect apps in Settings.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--radius-lg)] px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-[var(--signature)] text-[color:var(--on-signature)]'
                    : 'border border-[var(--border-subtle)] bg-surface-card text-body'
                }`}
              >
                {m.tools.map((t, ti) => {
                  const badge = effectBadge(t.sideEffect);
                  return (
                    <div
                      key={ti}
                      className="mb-2 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-2.5 py-1.5 text-xs"
                    >
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${badge.cls}`}>{badge.text}</span>
                      <span className="truncate text-muted">{t.label}</span>
                      {t.ok === undefined ? (
                        <span className="ml-auto animate-pulse text-faint">…</span>
                      ) : (
                        <span className={`ml-auto ${t.ok ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]'}`}>
                          {t.ok ? '✓' : '✕'}
                        </span>
                      )}
                    </div>
                  );
                })}
                {m.content || (m.role === 'assistant' && sending && i === messages.length - 1 ? (
                  <span className="text-faint">…</span>
                ) : null)}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-xs" style={{ color: 'var(--danger)' }}>
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
            className="input max-h-40 flex-1 resize-none text-sm"
          />
          <button onClick={send} disabled={sending || !input.trim()} className="btn-primary" style={{ padding: '12px 18px' }}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </section>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="card w-full max-w-sm p-6"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-semibold text-strong">Delete chat?</h3>
            <p className="mb-5 text-sm text-muted">
              &ldquo;{deleteTarget.title}&rdquo; will be permanently deleted. This can&apos;t be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmDeleteConversation}
                className="flex-1 rounded-[var(--radius-sm)] bg-[color:var(--danger)] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Delete
              </button>
              <button ref={cancelBtnRef} onClick={() => setDeleteTarget(null)} className="btn-outline flex-1 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
