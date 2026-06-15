// The editor tools keep their original dark canvas for now (re-skin later).
// This dark backdrop sits below the ink top bar so the light brand page
// background never bleeds into these screens.
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[calc(100dvh-4rem)] bg-zinc-950 text-zinc-100">{children}</div>;
}
