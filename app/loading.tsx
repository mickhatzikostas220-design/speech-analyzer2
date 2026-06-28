// Branded top-level loading state. Next.js shows this during route
// transitions and server-component data fetches so navigation never
// feels frozen with a blank screen.
export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--surface-page)]">
      <div
        className="h-9 w-9 animate-spin rounded-full border-[3px] border-[color:var(--border-subtle)] border-t-[color:var(--signature)]"
        role="status"
        aria-label="Loading"
      />
      <p className="mt-4 text-sm text-[color:var(--text-muted)]">Loading…</p>
    </main>
  );
}
