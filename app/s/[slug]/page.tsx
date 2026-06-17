import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProfileBySlug } from '@/lib/onesheet/server';
import { brandToCssVars, brandFontHref } from '@/lib/brand/theme';
import { Logo } from '@/components/brand/Logo';
import { InquiryForm } from '@/components/onesheet/InquiryForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const p = await getProfileBySlug(params.slug);
  if (!p) return { title: 'Speaker' };
  const desc = p.brand.oneSheet?.headline || p.brand.voice.about || `Book ${p.brand.name} to speak.`;
  return { title: `${p.brand.name} — Keynote Speaker`, description: desc };
}

export default async function OneSheetPage({ params }: { params: { slug: string } }) {
  const p = await getProfileBySlug(params.slug);
  if (!p) notFound();

  const { brand } = p;
  const os = brand.oneSheet ?? {};
  const vars = brandToCssVars(brand) as CSSProperties;
  const fontHref = brandFontHref(brand);
  const first = (brand.name || 'this speaker').split(' ')[0];
  const headline = os.headline || `Book ${brand.name} to speak.`;
  const bio = os.bio || brand.voice.about || '';
  const topics = os.topics ?? [];
  const testimonials = os.testimonials ?? [];

  return (
    <div style={vars} className="min-h-screen bg-surface-page text-body" data-onesheet>
      {fontHref && <link rel="stylesheet" href={fontHref} />}

      {/* top bar */}
      <header className="sticky top-0 z-30 bg-[color:var(--surface-ink)]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Logo brand={brand} color="paper" size={18} />
          <a
            href="#book"
            className="rounded-[var(--radius-pill)] px-4 py-2 text-sm font-bold"
            style={{ background: 'var(--signature)', color: 'var(--on-signature)', border: '2px solid var(--signature)' }}
          >
            Book {first}
          </a>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
        <div className="grid items-center gap-10 sm:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow mb-3">Keynote speaker{brand.tagline ? ` · ${brand.tagline}` : ''}</p>
            <h1
              className="mb-5"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-display)', lineHeight: 1.02, letterSpacing: '-0.02em', color: 'var(--text-strong)' }}
            >
              {headline}
            </h1>
            {bio && <p className="mb-7 max-w-xl text-lg leading-relaxed text-muted">{bio}</p>}
            <a href="#book" className="btn-primary" style={{ boxShadow: 'var(--shadow-hard)' }}>
              Bring {first} to your stage
            </a>
          </div>

          {brand.hero?.imageUrl ? (
            <div
              className="overflow-hidden rounded-[var(--radius-lg)] border-2 border-[var(--border-strong)]"
              style={{ boxShadow: 'var(--shadow-hard-lg)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.hero.imageUrl} alt={brand.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className="flex aspect-[4/5] items-center justify-center rounded-[var(--radius-lg)] border-2 border-[var(--border-strong)]"
              style={{ background: 'var(--signature)', boxShadow: 'var(--shadow-hard-lg)' }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 96, color: 'var(--on-signature)' }}>
                {(brand.name || 'S').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* signature talks */}
      {topics.length > 0 && (
        <section className="bg-[var(--surface-card)] py-14">
          <div className="mx-auto max-w-4xl px-5">
            <p className="eyebrow mb-2">Signature talks</p>
            <h2 className="mb-8" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--text-h2)', color: 'var(--text-strong)' }}>
              What {first} speaks on
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {topics.map((t, i) => (
                <div key={i} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-surface-page p-5">
                  <h3 className="mb-1.5 text-lg font-extrabold text-strong">{t.title}</h3>
                  {t.description && <p className="text-sm leading-relaxed text-muted">{t.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* testimonials */}
      {testimonials.length > 0 && (
        <section className="py-14">
          <div className="mx-auto max-w-4xl px-5">
            <p className="eyebrow mb-2">What organizers say</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {testimonials.map((t, i) => (
                <figure key={i} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-surface-card p-5">
                  <blockquote className="text-[15px] leading-relaxed text-body">“{t.quote}”</blockquote>
                  {(t.author || t.role) && (
                    <figcaption className="mt-3 text-sm font-bold text-strong">
                      {t.author}
                      {t.role && <span className="font-medium text-muted"> · {t.role}</span>}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* book */}
      <section id="book" className="scroll-mt-20 bg-[var(--surface-card)] py-16">
        <div className="mx-auto max-w-2xl px-5">
          <p className="eyebrow mb-2">Get in touch</p>
          <h2 className="mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--text-h2)', letterSpacing: '-0.02em', color: 'var(--text-strong)' }}>
            Bring {first} to your stage
          </h2>
          <p className="mb-7 text-muted">
            Share a few details and {first} will get back to you{os.contactEmail ? '' : ' soon'}.
          </p>
          <InquiryForm slug={p.slug} speakerName={brand.name} />
        </div>
      </section>

      {/* footer */}
      <footer className="bg-[color:var(--surface-ink)] py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-5 text-center">
          <Logo brand={brand} color="paper" size={16} />
          {os.contactEmail && (
            <a href={`mailto:${os.contactEmail}`} className="text-sm text-white/70 hover:text-white">
              {os.contactEmail}
            </a>
          )}
          <span className="text-[11px] text-white/40">Powered by Speaker Hub</span>
        </div>
      </footer>
    </div>
  );
}
