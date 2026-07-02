// Apple touch icon (180×180 PNG) used when someone adds Speaker Hub to their
// iOS home screen. Without this, iOS falls back to a blurry screenshot. Drawn
// with next/og so there is no binary asset to maintain.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1A2B50',
          color: '#FFFFFF',
          fontSize: 108,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
