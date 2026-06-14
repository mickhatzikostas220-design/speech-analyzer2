import { AgentChat } from '@/components/AgentChat';

export default function AssistantPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Assistant</h1>
        <p className="text-zinc-500 text-sm">
          Your AI speech coach that can act across the whole app. Ask it to explain
          engagement drops or compare sessions — or tell it to open, rename, export,
          re-run, or delete a speech, and it&apos;ll do it for you.
        </p>
      </div>
      <AgentChat />
    </div>
  );
}
