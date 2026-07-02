// Branded 404 page. Shown automatically by Next.js when a route or
// resource is not found, so users never hit the raw default screen.
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[color:var(--surface-page)] px-6 text-center">
      <p className="eyebrow mb-3">Error 404</p>
      <h1 className="display-h1 mb-4 text-[color:var(--text-strong)]">
        This page took a different stage.
      </h1>
      <p className="mb-8 max-w-md text-[color:var(--text-muted)]">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
        Let&apos;s get you back on track.
      </p>
      <Link href="/" className="btn-primary">
        Back home
      </Link>
    </main>
  );
}
