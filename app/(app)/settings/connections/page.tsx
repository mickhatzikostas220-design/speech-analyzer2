'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AgentConnectionsPanel } from '@/components/settings/AgentConnectionsPanel';
import { ApiKeysPanel } from '@/components/clipflow/ApiKeysPanel';
import { UploadPostPanel } from '@/components/clipflow/UploadPostPanel';
import { ConnectionsPanel } from '@/components/clipflow/ConnectionsPanel';

// Shared "Connections & API keys" page. Both the Assistant and ClipFlow manage
// their API keys and connected apps here, so "Connect" actions across the app
// land in one place. OAuth callbacks (Google + ClipFlow platforms + Upload-Post)
// redirect back here with a status query param.
function Banner() {
  const params = useSearchParams();

  if (params.get('connected') === 'google') {
    return <Ok text="Google connected (Gmail + Calendar)." />;
  }
  if (params.get('connected') === 'uploadpost') {
    return <Ok text="Publishing accounts connected." />;
  }
  const connect = params.get('connect');
  if (connect === 'success') {
    const platform = params.get('platform');
    return <Ok text={platform ? `${platform} connected.` : 'Connected.'} />;
  }
  if (connect === 'error') {
    const msg = params.get('msg');
    return <Err text={msg ? decodeURIComponent(msg) : 'Could not connect that platform.'} />;
  }
  const error = params.get('error');
  if (error) return <Err text={`Connection failed: ${error}`} />;
  return null;
}

function Ok({ text }: { text: string }) {
  return (
    <p
      className="rounded-[var(--radius-sm)] px-3 py-2 text-xs"
      style={{ color: 'var(--success)', background: 'var(--success-bg)' }}
    >
      {text}
    </p>
  );
}
function Err({ text }: { text: string }) {
  return (
    <p
      className="rounded-[var(--radius-sm)] px-3 py-2 text-xs"
      style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}
    >
      {text}
    </p>
  );
}

export default function ConnectionsSettingsPage() {
  const [connRefresh, setConnRefresh] = useState(0);
  const bump = () => setConnRefresh((v) => v + 1);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-strong">Connections &amp; API keys</h1>
          <p className="text-muted text-sm mt-1">
            Connect your apps and add your API keys here — shared by the Assistant and ClipFlow.
          </p>
        </div>
        <Link href="/settings" className="text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
          ← Settings
        </Link>
      </div>

      <Suspense fallback={null}>
        <Banner />
      </Suspense>

      {/* Assistant */}
      <AgentConnectionsPanel onChanged={bump} />

      {/* ClipFlow */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-strong">ClipFlow</h2>
          <p className="text-xs text-muted mt-0.5">
            Keys for clip generation and the accounts your clips publish to.
          </p>
        </div>
        <ApiKeysPanel onChanged={bump} />
        <UploadPostPanel onChanged={bump} />
        <ConnectionsPanel refresh={connRefresh} />
      </section>
    </div>
  );
}
