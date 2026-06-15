'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand/types';
import { generateGreeting } from '@/lib/brand/greeting';
import { normalizeHex } from '@/lib/brand/color';
import { BrandPreview } from './BrandPreview';

const FONT_PRESETS: { label: string; display: string; body: string; cssHref: string }[] = [
  {
    label: 'Montserrat (default)',
    display: "'Montserrat', system-ui, sans-serif",
    body: "'Montserrat', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,600&family=Alex+Brush&family=Roboto+Mono:wght@400;500&display=swap',
  },
  {
    label: 'Poppins',
    display: "'Poppins', system-ui, sans-serif",
    body: "'Poppins', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Alex+Brush&display=swap',
  },
  {
    label: 'Inter',
    display: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Alex+Brush&display=swap',
  },
  {
    label: 'Playfair + Inter (editorial)',
    display: "'Playfair Display', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800;900&family=Inter:wght@400;500;600;700&family=Alex+Brush&display=swap',
  },
  {
    label: 'Work Sans',
    display: "'Work Sans', system-ui, sans-serif",
    body: "'Work Sans', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800;900&family=Alex+Brush&display=swap',
  },
];

const TONES = [
  { label: 'Bold & salty', value: 'Bold, warm, second-person, anti-corporate-BS' },
  { label: 'Warm & human', value: 'Warm, encouraging, human' },
  { label: 'Playful', value: 'Playful, witty, cheeky' },
  { label: 'Polished & professional', value: 'Professional, polished, expert' },
];

export function BrandSettings({ initialBrand }: { initialBrand: BrandKit }) {
  const router = useRouter();
  const [brand, setBrand] = useState<BrandKit>(initialBrand);
  const [url, setUrl] = useState(initialBrand.sourceUrl ?? '');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function patch(updater: (b: BrandKit) => BrandKit) {
    setBrand((prev) => updater(structuredClone(prev)));
  }
  function setColor(key: keyof BrandKit['colors'], value: string) {
    patch((b) => {
      b.colors[key] = value;
      b.source = 'custom';
      return b;
    });
  }

  async function reimport() {
    if (!url.trim()) return;
    setImporting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/brand/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not read that site.' });
      } else {
        setBrand(data.brand);
        setMsg({ kind: 'ok', text: 'Pulled a fresh brand from your site. Review and save.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Network hiccup — try again.' });
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, websiteUrl: url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not save.' });
      } else {
        setBrand(data.brand);
        setMsg({ kind: 'ok', text: 'Saved. Your hub is rebranded.' });
        router.refresh();
      }
    } catch {
      setMsg({ kind: 'err', text: 'Could not save. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const colorFields: { key: keyof BrandKit['colors']; label: string }[] = [
    { key: 'signature', label: 'Signature' },
    { key: 'accent', label: 'Accent' },
    { key: 'ink', label: 'Ink / text' },
    { key: 'paper', label: 'Card / paper' },
    { key: 'page', label: 'Page background' },
    { key: 'onSignature', label: 'Text on signature' },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(320px,420px)]">
      {/* editor */}
      <div className="space-y-8">
        {/* re-import */}
        <section className="card p-5">
          <h2 className="section-title">Import from your website</h2>
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Pull your colors, logo, and fonts straight from your site.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yourname.com"
              className="input flex-1"
            />
            <button onClick={reimport} disabled={importing} className="btn-ink">
              {importing ? 'Reading…' : 'Re-import'}
            </button>
          </div>
        </section>

        {/* identity */}
        <section className="card p-5 space-y-4">
          <h2 className="section-title">Identity</h2>
          <div>
            <label className="field-label">Name</label>
            <input
              value={brand.name}
              onChange={(e) =>
                patch((b) => {
                  b.name = e.target.value;
                  if (b.logo.type === 'wordmark') b.logo.wordmarkText = e.target.value;
                  return b;
                })
              }
              className="input w-full"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Logo style</label>
              <select
                value={brand.logo.type}
                onChange={(e) =>
                  patch((b) => {
                    b.logo.type = e.target.value === 'image' ? 'image' : 'wordmark';
                    return b;
                  })
                }
                className="input w-full"
              >
                <option value="wordmark">Wordmark (your name)</option>
                <option value="image">Image logo</option>
              </select>
            </div>
            {brand.logo.type === 'image' && (
              <div>
                <label className="field-label">Logo image URL</label>
                <input
                  value={brand.logo.imageUrl ?? ''}
                  onChange={(e) => patch((b) => ((b.logo.imageUrl = e.target.value), b))}
                  placeholder="https://…/logo.png"
                  className="input w-full"
                />
              </div>
            )}
          </div>
          <div>
            <label className="field-label">Hero / headshot image URL</label>
            <input
              value={brand.hero.imageUrl ?? ''}
              onChange={(e) => patch((b) => ((b.hero.imageUrl = e.target.value), b))}
              placeholder="https://…/you-on-stage.jpg"
              className="input w-full"
            />
          </div>
        </section>

        {/* colors */}
        <section className="card p-5">
          <h2 className="section-title">Colors</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {colorFields.map((f) => (
              <div key={f.key}>
                <label className="field-label">{f.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={normalizeHex(brand.colors[f.key]) ?? '#000000'}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border-2 border-[var(--border-strong)] bg-transparent"
                  />
                  <input
                    value={brand.colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="input flex-1 font-mono text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* type + voice */}
        <section className="card p-5 space-y-4">
          <h2 className="section-title">Type &amp; voice</h2>
          <div>
            <label className="field-label">Fonts</label>
            <select
              value={FONT_PRESETS.find((p) => p.display === brand.fonts.display)?.label ?? 'custom'}
              onChange={(e) => {
                const p = FONT_PRESETS.find((x) => x.label === e.target.value);
                if (p) patch((b) => ((b.fonts = { display: p.display, body: p.body, cssHref: p.cssHref }), b));
              }}
              className="input w-full"
            >
              {FONT_PRESETS.map((p) => (
                <option key={p.label}>{p.label}</option>
              ))}
              {!FONT_PRESETS.find((p) => p.display === brand.fonts.display) && (
                <option value="custom">Imported from your site</option>
              )}
            </select>
          </div>
          <div>
            <label className="field-label">Voice / tone</label>
            <select
              value={brand.voice.tone}
              onChange={(e) =>
                patch((b) => {
                  b.voice.tone = e.target.value;
                  b.voice.greeting = generateGreeting(b);
                  return b;
                })
              }
              className="input w-full"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {!TONES.find((t) => t.value === brand.voice.tone) && (
                <option value={brand.voice.tone}>Imported</option>
              )}
            </select>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              Greeting preview: “Hey {brand.name.split(' ')[0]}, {brand.voice.greeting}”
            </p>
          </div>
        </section>
      </div>

      {/* live preview + save */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <p className="eyebrow">Live preview</p>
        <BrandPreview brand={brand} />
        {msg && (
          <p
            className={`rounded-[var(--radius-sm)] px-4 py-2.5 text-sm ${
              msg.kind === 'ok'
                ? 'bg-[var(--success-bg)] text-[var(--success)]'
                : 'bg-[var(--danger-bg)] text-[var(--danger)]'
            }`}
          >
            {msg.text}
          </p>
        )}
        <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? 'Saving…' : 'Save brand'}
        </button>
      </div>
    </div>
  );
}
