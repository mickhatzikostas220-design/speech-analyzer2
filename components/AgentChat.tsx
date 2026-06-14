'use client';

import { useState, useRef, useEffect } from 'react';

type ToolStep = { name: string; ok?: boolean };
type Role = 'user' | 'assistant';
interface UIMessage {
  role: Role;
  content: string;
  tools: ToolStep[];
}

const TOOL_LABELS: Record<string, string> = {
  list_speeches: 'Looking up your speeches',
  get_speech_analysis: 'Reading the analysis',
  get_transcript: 'Reading the transcript',
  search_transcripts: 'Searching transcripts',
  compare_speeches: 'Comparing speeches',
};

const SUGGESTIONS = [
  'Which of my speeches scored highest?',
  'Why did engagement drop in my latest speech?',
  'Compare my two most recent speeches.',
  'How has my mind-wandering score changed over time?',
];

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Using ${name}`;
}

export function AgentChat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
        let event: { type: string; text?: string; name?: string; ok?: boolean; message?: string };
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
    }
  }

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-[70vh]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-purple-500 to-indigo-500 flex-shrink-0" />
        <h2 className="text-sm font-medium text-zinc-200">Assistant</h2>
        <span className="text-xs text-zinc-600">· asks across all your speeches</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <p className="text-zinc-400 text-sm max-w-sm">
              Ask anything about your speeches. I can look up scores, read transcripts,
              compare sessions, and find moments across everything you&apos;ve analyzed.
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
          placeholder="Ask about your speeches…"
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
