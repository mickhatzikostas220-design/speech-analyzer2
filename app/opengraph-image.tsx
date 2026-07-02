// Social-share image (Open Graph + Twitter) rendered at build/request time by
// next/og. Shown when a Speaker Hub link is pasted into iMessage, Slack,
// LinkedIn, X, etc. Uses brand colors and the default font for reliability.

import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

export const runtime = 'edge';
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: 'linear-gradient(135deg, #1A2B50 0%, #11203F 55%, #0B1730 100%)',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#2E4D8E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>
            {SITE_NAME}
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            Every tool a speaker needs, in one place.
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#C9C9D1', maxWidth: 860 }}>
            Analyze your talks with AI, sharpen your scripts, manage bookings, and cut shareable clips.
          </div>
        </div>

        {/* Footer chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#9AB0E0' }}>
          {['Speech Analyzer', 'Script Studio', 'Booking Inbox', 'ClipFlow'].map((t) => (
            <div
              key={t}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,0.18)',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
