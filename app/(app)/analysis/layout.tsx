// Analysis detail keeps its original dark visualization canvas for now.
export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-4rem)] bg-zinc-950 text-zinc-100">{children}</div>;
}
