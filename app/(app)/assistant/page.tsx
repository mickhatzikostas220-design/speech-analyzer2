import { AgentChat } from '@/components/AgentChat';

export default function AssistantPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Assistant</h1>
        <p className="text-zinc-500 text-sm">
          Your AI speech coach with access to all of your neural analyses. Ask it to
          compare sessions, explain engagement drops, or find moments across your speeches.
        </p>
      </div>
      <AgentChat />
    </div>
  );
}
