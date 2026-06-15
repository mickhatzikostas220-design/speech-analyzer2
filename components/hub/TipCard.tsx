import { Lightbulb } from 'lucide-react';

/** The yellow "sticker" tip card from the hub design. */
export function TipCard({ tip, label = 'Coach’s tip' }: { tip: string; label?: string }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] p-5"
      style={{
        background: 'var(--signature)',
        color: 'var(--on-signature)',
        border: '2px solid var(--border-strong)',
        boxShadow: 'var(--shadow-hard-lg)',
      }}
    >
      <div
        className="mb-2 flex items-center gap-2"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}
      >
        <Lightbulb className="h-4 w-4" strokeWidth={2.25} />
        {label}
      </div>
      <p className="text-sm" style={{ margin: 0 }}>
        {tip}
      </p>
    </div>
  );
}
