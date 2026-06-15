import type { BrandKit } from '@/lib/brand/types';
import { wordmarkText } from '@/lib/brand/theme';

/**
 * Brand logo. Renders the speaker's uploaded/extracted image logo when
 * present, otherwise a generated mark (their initial on the signature
 * color) + wordmark in the brand display font. Pure presentational —
 * safe in server or client components.
 */
export function Logo({
  brand,
  color = 'ink',
  size = 22,
  withMark = true,
}: {
  brand: BrandKit;
  color?: 'ink' | 'paper';
  size?: number;
  withMark?: boolean;
}) {
  if (brand.logo.type === 'image' && brand.logo.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo.imageUrl}
        alt={brand.name}
        style={{ height: Math.round(size * 1.35), width: 'auto', maxWidth: 200, objectFit: 'contain' }}
      />
    );
  }

  const textColor = color === 'paper' ? 'var(--text-on-dark)' : 'var(--text-strong)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {withMark && <Mark brand={brand} size={Math.round(size * 1.3)} />}
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size,
          letterSpacing: '0.01em',
          color: textColor,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {wordmarkText(brand)}
      </span>
    </span>
  );
}

export function Mark({ brand, size = 28 }: { brand: BrandKit; size?: number }) {
  if (brand.logo.markUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo.markUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), objectFit: 'cover' }}
      />
    );
  }
  const initial = (brand.name || 'S').trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: 'var(--signature)',
        color: 'var(--on-signature)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: Math.round(size * 0.58),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
