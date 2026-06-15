// History keeps a dark backdrop; the analysis cards themselves are brand-light.
export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-4rem)] bg-zinc-950 text-zinc-100">{children}</div>;
}
