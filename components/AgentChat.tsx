'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type ToolStep = { name: string; ok?: boolean };
type Role = 'user' | 'assistant';
type DeleteState = 'pending' | 'deleting' | 'done' | 'cancelled';

interface UIMessage {
  role: Role;
  content: string;
  tools: ToolStep[];
  confirmDelete?: { id: string; title: string; state: DeleteState };
}

const TOOL_LABELS: Record<string, string> = {
  list_speeches: 'Looking up your speeches',
  get_speech_analysis: 'Reading the analysis',
  get_transcript: 'Reading the transcript',
  search_transcripts: 'Searching transcripts',
  compare_speeches: 'Comparing speeches',
  open_speech: 'Opening the speech',
  go_to_page: 'Navigating',
  rename_speech: 'Renaming the speech',
  reprocess_speech: 'Re-running the analysis',
  export_speech: 'Preparing the download',
  delete_speech: 'Preparing to delete',
};

const SUGGESTIONS = [
  'Open my most recent speech',
  'Which of my speeches scored highest?',
  'Why did engagement drop in my latest speech?',
  'Compare my two most recent speeches',
];

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Using ${name}`;
}

export function AgentChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pendingNav = useRef<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update the trailing assistant message immutably.
  function patchAssistant(fn: (msg: UIMessage) => UIMessage) {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }

  function runAction(action: string, args: Record<string, unknown>) {
    const id = typeof args.id === 'string' ? args.id : '';
    if (action === 'navigate' && typeof args.path === 'string') {
      // Defer until the stream finishes so the assistant's reply renders first.
      pendingNav.current = args.path;
    } else if (action === 'export' && id) {
      const format = typeof args.format === 'string' ? args.format : 'json';
      window.open(`/api/analyses/${id}/export?format=${format}`, '_blank');
    } else if (action === 'reprocess' && id) {
      fetch(`/api/analyses/${id}/process`, { method: 'POST' }).catch(() => {});
    } else if (action === 'confirm_delete' && id) {
      const title = typeof args.title === 'string' ? args.title : 'this speech';
      patchAssistant((m) => ({ ...m, confirmDelete: { id, title, state: 'pending' } }));
    }
  }

  function setDeleteState(msgIndex: number, state: DeleteState) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === msgIndex && m.confirmDelete ? { ...m, confirmDelete: { ...m.confirmDelete, state } } : m,
      ),
    );
  }

  async function confirmDelete(msgIndex: number, id: string) {
    setDeleteState(msgIndex, 'deleting');
    try {
      const res = await fetch(`/api/analyses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setDeleteState(msgIndex, 'done');
    } catch {
      setDeleteState(msgIndex, 'pending');
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: UIMessage = { role: 'user', content: trimmed, tools: [] };
    const payload = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }),
      });

      if (!res.ok || !res.body) throw new Error('request failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const handle = (line: string) => {
        if (!line.trim()) return;
        let event: {
          type: string;
          text?: string;
          name?: string;
          ok?: boolean;
          message?: string;
          action?: string;
          args?: Record<string, unknown>;
        };
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event.type === 'text' && event.text) {
          patchAssistant((m) => ({ ...m, content: m.content + event.text }));
        } else if (event.type === 'tool_use' && event.name) {
          patchAssistant((m) => ({ ...m, tools: [...m.tools, { name: event.name! }] }));
        } else if (event.type === 'tool_result' && event.name) {
          patchAssistant((m) => {
            const tools = [...m.tools];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === event.name && tools[i].ok === undefined) {
                tools[i] = { ...tools[i], ok: event.ok };
                break;
              }
            }
            return { ...m, tools };
          });
        } else if (event.type === 'action' && event.action) {
          runAction(event.action, event.args ?? {});
        } else if (event.type === 'error' && event.message) {
          patchAssistant((m) => ({
            ...m,
            content: m.content ? `${m.content}\n\n${event.message}` : event.message!,
          }));
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) handle(line);
      }
      if (buffer) handle(buffer);
    } catch {
      patchAssistant((m) => ({
        ...m,
        content: m.content || 'Something went wrong. Please try again.',
      }));
    } finally {
      setLoading(false);
      if (pendingNav.current) {
        const path = pendingNav.current;
        pendingNav.current = null;
        router.push(path);
      }
    }
  }

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[70vh]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-purple-500 to-indigo-500 flex-shrink-0" />
        <h2 className="text-sm font-medium text-zinc-200">Assistant</h2>
        <span className="text-xs text-zinc-600">· can read and act across your speeches</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <p className="text-zinc-400 text-sm max-w-sm">
              Ask anything about your speeches — or tell me to do things for you: open a
              speech, rename or export one, re-run a failed analysis, or compare sessions.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-full border border-zinc-700 transition-colors"
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
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user' ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-200'
              }`}
            >
              {msg.role === 'assistant' && msg.tools.length > 0 && (
                <div className="space-y-1 mb-2">
                  {msg.tools.map((t, ti) => (
                    <div key={ti} className="flex items-center gap-2 text-xs text-zinc-400">
                      {t.ok === undefined ? (
                        <span className="w-3 h-3 rounded-full border-2 border-zinc-600 border-t-purple-400 animate-spin" />
                      ) : t.ok ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-amber-400">!</span>
                      )}
                      <span>{toolLabel(t.name)}</span>
                    </div>
                  ))}
                </div>
              )}
              {msg.content ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                msg.role === 'assistant' &&
                msg.tools.length === 0 && (
                  <span className="opacity-40 animate-pulse">Thinking…</span>
                )
              )}

              {msg.confirmDelete && (
                <div className="mt-2 pt-2 border-t border-zinc-700">
                  {msg.confirmDelete.state === 'pending' && (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-400">
                        Delete <span className="text-zinc-200">&ldquo;{msg.confirmDelete.title}&rdquo;</span>?
                        This permanently removes it and its file.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => confirmDelete(i, msg.confirmDelete!.id)}
                          className="text-xs px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteState(i, 'cancelled')}
                          className="text-xs px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {msg.confirmDelete.state === 'deleting' && (
                    <p className="text-xs text-zinc-400">Deleting…</p>
                  )}
                  {msg.confirmDelete.state === 'done' && (
                    <p className="text-xs text-emerald-400">
                      Deleted &ldquo;{msg.confirmDelete.title}&rdquo;.
                    </p>
                  )}
                  {msg.confirmDelete.state === 'cancelled' && (
                    <p className="text-xs text-zinc-500">Okay, I left it in place.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t border-zinc-800"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything, or tell me what to do…"
          disabled={loading}
          className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500 placeholder-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          {loading ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
