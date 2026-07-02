'use client';

// Last-resort error boundary. Next.js renders this only when the ROOT layout
// itself fails — the one case app/error.tsx can't catch, because error.tsx
// renders *inside* the root layout. Because the failed layout is what imports
// globals.css, we can't rely on the design-token classes here, so everything is
// styled inline with hardcoded brand colors. That guarantees users still get an
// on-brand, recoverable screen even when nothing else on the page loaded.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console so it lands in Vercel logs / monitoring.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          background: '#F6F6F9',
          color: '#111114',
          fontFamily:
            "'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#1A2B50',
          }}
        >
          Something went wrong
        </p>
        <h1
          style={{
            margin: '12px 0 0',
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
            fontWeight: 900,
            lineHeight: 1.1,
            maxWidth: 560,
          }}
        >
          We hit an unexpected error.
        </h1>
        <p style={{ margin: '16px 0 0', maxWidth: 420, color: '#4A4A55', fontSize: 16 }}>
          This one&apos;s on us. Try again — and if it keeps happening, please let us know.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              cursor: 'pointer',
              border: 'none',
              borderRadius: 10,
              padding: '12px 22px',
              fontSize: 15,
              fontWeight: 700,
              color: '#FFFFFF',
              background: '#1A2B50',
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              borderRadius: 10,
              padding: '12px 22px',
              fontSize: 15,
              fontWeight: 700,
              color: '#1A2B50',
              background: 'transparent',
              border: '2px solid #1A2B50',
              textDecoration: 'none',
            }}
          >
            Back home
          </a>
        </div>

        {error.digest ? (
          <p style={{ marginTop: 24, fontSize: 12, color: '#8A8A95' }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
