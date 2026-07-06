// ── "COMING SOON" LOCK — single source of truth ──────────────────────────────
// This is the ONE place to lock a tool that isn't ready for the public yet.
//
// Add a tool's route to COMING_SOON_PATHS and, everywhere at once:
//   • the hub shows the tool with a "Coming soon" badge and makes it un-clickable
//   • it can't be pinned to the top bar
//   • visiting its URL directly redirects to the hub (see middleware.ts)
// Remove the line the moment the tool is ready, and it goes fully live again.
//
// Kept deliberately dependency-free (plain strings, no imports) so the edge
// middleware can import it without pulling in the icon-heavy tool catalog.

// Routes that are locked. Use the tool's base route exactly as in the catalog
// (e.g. '/clipflow'). Nested pages under it (e.g. '/clipflow/123') are covered.
export const COMING_SOON_PATHS: readonly string[] = [
  // Example — uncomment to lock ClipFlow until its social posting is live:
  // '/clipflow',
];

/** True when the given pathname is (or is under) a locked tool route. */
export function isPathComingSoon(pathname: string): boolean {
  return COMING_SOON_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}
