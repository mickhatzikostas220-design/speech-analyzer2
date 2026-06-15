import type { CSSProperties } from 'react';
import type { BrandKit } from '@/lib/brand/types';
import { brandToCssVars } from '@/lib/brand/theme';
import { Logo } from './Logo';

/**
 * A miniature, live-themed "hub" preview. Applies the candidate brand's
 * CSS variables to its own subtree, so it reflects a kit before it's
 * saved/applied app-wide. Used in onboarding and settings.
 */
export function BrandPreview({ brand }: { brand: BrandKit }) {
  const vars = brandToCssVars(brand) as CSSProperties;
  const swatches: { label: string; value: string }[] = [
    { label: 'Signature', value: brand.colors.signature },
    { label: 'Accent', value: brand.colors.accent },
    { label: 'Ink', value: brand.colors.ink },
    { label: 'Paper', value: brand.colors.paper },
  ];

  return (
    <div
      style={vars}
      className="overflow-hidden rounded-[var(--radius-lg)] border-2 border-[var(--border-strong)] shadow-[var(--shadow-hard)]"
    >
      {brand.fonts.cssHref && <link rel="stylesheet" href={brand.fonts.cssHref} />}

      {/* faux top bar */}
      <div className="flex items-center justify-between bg-[var(--surface-ink)] px-4 py-3">
        <Logo brand={brand} color="paper" size={18} />
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--signature)]" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
        </div>
      </div>

      {/* hub body */}
      <div className="bg-[var(--surface-page)] px-5 py-6" style={{ fontFamily: 'var(--font-body)' }}>
        <p
          className="mb-1 text-[0.7rem] font-bold uppercase"
          style={{ letterSpacing: '0.16em', color: 'var(--text-muted)' }}
        >
          Your hub
        </p>
        <h3
          className="mb-3 text-2xl"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--text-strong)',
            lineHeight: 1.1,
          }}
        >
          Hey {brand.name.split(' ')[0]},{' '}
          <span style={{ fontFamily: 'var(--font-script)', fontWeight: 400, fontSize: '1.6em' }}>
            {brand.voice.greeting || "let's get to work."}
          </span>
        </h3>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <span
            className="inline-flex items-center rounded-[var(--radius-pill)] px-4 py-2 text-sm"
            style={{
              background: 'var(--signature)',
              color: 'var(--on-signature)',
              border: '2px solid var(--border-strong)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
            }}
          >
            Upload a talk
          </span>
          <span
            className="inline-flex items-center rounded-[var(--radius-pill)] px-4 py-2 text-sm"
            style={{
              background: 'transparent',
              color: 'var(--text-strong)',
              border: '2px solid var(--border-strong)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
            }}
          >
            Talk library
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {swatches.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="h-6 w-6 rounded-md border border-[var(--border-default)]"
                style={{ background: s.value }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
