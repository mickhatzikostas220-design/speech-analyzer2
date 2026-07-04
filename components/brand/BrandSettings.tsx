'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand/types';
import { generateGreeting } from '@/lib/brand/greeting';
import { normalizeHex } from '@/lib/brand/color';
import { BrandPreview } from './BrandPreview';
import { cloneDefaultBrand } from '@/lib/brand/defaults';

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
  {
    label: 'Space Grotesk',
    display: "'Space Grotesk', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Alex+Brush&display=swap',
  },
  {
    label: 'Sora',
    display: "'Sora', system-ui, sans-serif",
    body: "'Sora', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Alex+Brush&display=swap',
  },
  {
    label: 'Lora + Inter (warm serif)',
    display: "'Lora', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
    cssHref:
      'https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Alex+Brush&display=swap',
  },
];

const TONES = [
  { label: 'Bold & salty', value: 'Bold, warm, second-person, anti-corporate-BS' },
  { label: 'Warm & human', value: 'Warm, encouraging, human' },
  { label: 'Playful', value: 'Playful, witty, cheeky' },
  { label: 'Polished & professional', value: 'Professional, polished, expert' },
];

// Curated one-click color palettes — quick professional starting points for
// speakers who don't want to hand-pick six hex values.
const COLOR_PRESETS: { label: string; colors: BrandKit['colors'] }[] = [
  { label: 'Navy',     colors: { signature: '#1A2B50', accent: '#2E4D8E', ink: '#111114', paper: '#FFFFFF', page: '#F6F6F9', onSignature: '#FFFFFF' } },
  { label: 'Emerald',  colors: { signature: '#0F5132', accent: '#198754', ink: '#111114', paper: '#FFFFFF', page: '#F3F8F5', onSignature: '#FFFFFF' } },
  { label: 'Burgundy', colors: { signature: '#6A1B2A', accent: '#A4303F', ink: '#111114', paper: '#FFFFFF', page: '#FAF4F5', onSignature: '#FFFFFF' } },
  { label: 'Charcoal', colors: { signature: '#1F2937', accent: '#4B5563', ink: '#111114', paper: '#FFFFFF', page: '#F5F5F7', onSignature: '#FFFFFF' } },
  { label: 'Plum',     colors: { signature: '#4C1D6B', accent: '#7C3AED', ink: '#111114', paper: '#FFFFFF', page: '#F7F4FB', onSignature: '#FFFFFF' } },
  { label: 'Teal',     colors: { signature: '#0E5C63', accent: '#0D9488', ink: '#111114', paper: '#FFFFFF', page: '#F1F8F8', onSignature: '#FFFFFF' } },
];

// WCAG relative-luminance contrast ratio between two hex colors (null if either
// can't be parsed). Used to warn when the brand color and its text are too
// low-contrast to read.
function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function contrastRatio(hex1: string, hex2: string): number | null {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return null;
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (c: [number, number, number]) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

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

  // Reset the look (colors, fonts, logo style, voice) back to the default kit
  // while keeping the speaker's name/wordmark. Doesn't auto-save — the user
  // reviews the preview, then clicks Save brand to apply.
  function resetToDefault() {
    const fresh = cloneDefaultBrand();
    fresh.name = brand.name;
    if (fresh.logo.type === 'wordmark') fresh.logo.wordmarkText = brand.name;
    setBrand(fresh);
    setMsg({ kind: 'ok', text: 'Reset to the default look — click “Save brand” to apply.' });
  }

  function applyColorPreset(colors: BrandKit['colors']) {
    patch((b) => { b.colors = { ...b.colors, ...colors }; return b; });
    setMsg({ kind: 'ok', text: 'Palette applied — click “Save brand” to keep it.' });
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

  // Accessibility: flag any key text/background pair below WCAG AA (4.5:1).
  const contrastChecks = [
    { label: 'Button & header text (on signature)', ratio: contrastRatio(brand.colors.signature, brand.colors.onSignature) },
    { label: 'Body text on the page', ratio: contrastRatio(brand.colors.page, brand.colors.ink) },
    { label: 'Text on cards', ratio: contrastRatio(brand.colors.paper, brand.colors.ink) },
  ];
  const lowContrastPairs = contrastChecks.filter(
    (c): c is { label: string; ratio: number } => c.ratio !== null && c.ratio < 4.5
  );

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
              aria-label="Your website URL to import brand from"
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
            <label htmlFor="brand-name" className="field-label">Name</label>
            <input
              id="brand-name"
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
              <label htmlFor="brand-logo-style" className="field-label">Logo style</label>
              <select
                id="brand-logo-style"
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
                <label htmlFor="brand-logo-url" className="field-label">Logo image URL</label>
                <input
                  id="brand-logo-url"
                  value={brand.logo.imageUrl ?? ''}
                  onChange={(e) => patch((b) => ((b.logo.imageUrl = e.target.value), b))}
                  placeholder="https://…/logo.png"
                  className="input w-full"
                />
              </div>
            )}
          </div>
          <div>
            <label htmlFor="brand-hero-url" className="field-label">Hero / headshot image URL</label>
            <input
              id="brand-hero-url"
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
          {/* one-click palettes */}
          <div className="mb-4 flex flex-wrap gap-2">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyColorPreset(p.colors)}
                title={`Apply ${p.label} palette`}
                className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.colors.signature }} />
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {colorFields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`color-${f.key}`} className="field-label">{f.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={`color-${f.key}`}
                    type="color"
                    value={normalizeHex(brand.colors[f.key]) ?? '#000000'}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    aria-label={`${f.label} color picker`}
                    className="h-10 w-12 cursor-pointer rounded-md border-2 border-[var(--border-strong)] bg-transparent"
                  />
                  <input
                    value={brand.colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    aria-label={`${f.label} hex value`}
                    className="input flex-1 font-mono text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          {lowContrastPairs.length > 0 && (
            <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--warning-bg)] px-3 py-2 text-xs" style={{ color: '#8A6D00' }}>
              <p className="font-semibold">Low contrast — this text may be hard to read (aim for 4.5:1):</p>
              <ul className="mt-1 space-y-0.5">
                {lowContrastPairs.map((c) => (
                  <li key={c.label}>• {c.label} — {c.ratio.toFixed(1)}:1</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* type + voice */}
        <section className="card p-5 space-y-4">
          <h2 className="section-title">Type &amp; voice</h2>
          <div>
            <label htmlFor="brand-fonts" className="field-label">Fonts</label>
            <select
              id="brand-fonts"
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
            <label htmlFor="brand-voice" className="field-label">Voice / tone</label>
            <select
              id="brand-voice"
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
            role={msg.kind === 'ok' ? 'status' : 'alert'}
            className="rounded-[var(--radius-sm)] px-4 py-2.5 text-sm"
            style={{
              background: msg.kind === 'ok' ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: msg.kind === 'ok' ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          >
            {msg.text}
          </p>
        )}
        <button onClick={save} disabled={saving} className="btn-primary w-full justify-center">
          {saving ? 'Saving…' : 'Save brand'}
        </button>
        <button
          type="button"
          onClick={resetToDefault}
          disabled={saving}
          className="btn-ghost w-full justify-center text-sm"
        >
          Reset to default look
        </button>
      </div>
    </div>
  );
}
