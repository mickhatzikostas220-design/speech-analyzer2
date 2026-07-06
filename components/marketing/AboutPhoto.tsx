'use client';

// Headshot for the About page. It tries to load the photo from /public; if the
// file isn't there yet (or fails to load), it gracefully falls back to Mick's
// initials so the page never shows a broken image. To use a real photo, save it
// to the /public folder (e.g. public/mick.jpg) — no code change needed.

import { useState } from 'react';

export function AboutPhoto({
  src,
  initials,
  alt,
}: {
  src: string;
  initials: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[var(--radius-xl)] text-4xl font-black"
        style={{
          background: 'var(--signature)',
          color: 'var(--on-signature)',
          boxShadow: 'var(--shadow-hard)',
        }}
        aria-label={alt}
      >
        {initials}
      </div>
    );
  }

  return (
    // Plain <img> (not next/image) so a missing file degrades to the initials
    // fallback via onError instead of throwing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-28 w-28 shrink-0 rounded-[var(--radius-xl)] object-cover"
      style={{ boxShadow: 'var(--shadow-hard)' }}
    />
  );
}
