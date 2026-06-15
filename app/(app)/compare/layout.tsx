// Compare keeps its original dark multi-metric charts for now.
export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-4rem)] bg-zinc-950 text-zinc-100">{children}</div>;
}
