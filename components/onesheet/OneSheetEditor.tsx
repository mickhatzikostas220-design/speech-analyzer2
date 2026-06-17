'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, ExternalLink, Copy } from 'lucide-react';
import type { OneSheet, OneSheetTopic, OneSheetTestimonial } from '@/lib/brand/types';

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function OneSheetEditor() {
  const [loaded, setLoaded] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [os, setOs] = useState<OneSheet>({ topics: [], testimonials: [] });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/onesheet')
      .then((r) => r.json())
      .then((d) => {
        setName(d.name || '');
        setSlug(d.slug || slugify(d.name || ''));
        setOs({ topics: [], testimonials: [], ...(d.oneSheet || {}) });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function patch(p: Partial<OneSheet>) {
    setOs((prev) => ({ ...prev, ...p }));
  }
  function setTopic(i: number, t: Partial<OneSheetTopic>) {
    patch({ topics: (os.topics ?? []).map((x, j) => (j === i ? { ...x, ...t } : x)) });
  }
  function setTestimonial(i: number, t: Partial<OneSheetTestimonial>) {
    patch({ testimonials: (os.testimonials ?? []).map((x, j) => (j === i ? { ...x, ...t } : x)) });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/onesheet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, oneSheet: os }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ kind: 'err', text: d.error || 'Could not publish.' });
      else {
        setSlug(d.slug);
        setMsg({ kind: 'ok', text: 'Published. Your one-sheet is live.' });
      }
    } catch {
      setMsg({ kind: 'err', text: 'Could not publish. Try again.' });
    } finally {
      setSaving(false);
    }
  }

  const publicUrl = slug ? `${origin}/s/${slug}` : '';

  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      {/* public link */}
      <section className="card p-5">
        <h2 className="section-title">Your public link</h2>
        <p className="mb-3 text-sm text-muted">Share this anywhere — inquiries land in your Booking Inbox.</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{origin}/s/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            placeholder="your-name"
            className="input flex-1 text-sm"
          />
          {publicUrl && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(publicUrl); setMsg({ kind: 'ok', text: 'Link copied.' }); }} className="btn-outline" style={{ padding: '8px 14px', fontSize: 'var(--text-sm)' }}>
                <Copy className="h-4 w-4" /> Copy
              </button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '8px 14px', fontSize: 'var(--text-sm)' }}>
                <ExternalLink className="h-4 w-4" /> Preview
              </a>
            </>
          )}
        </div>
      </section>

      {/* content */}
      <section className="card space-y-4 p-5">
        <h2 className="section-title">One-sheet content</h2>
        <div>
          <label className="field-label">Headline</label>
          <input className="input w-full" value={os.headline ?? ''} onChange={(e) => patch({ headline: e.target.value })} placeholder={`Book ${name || 'me'} to speak.`} />
        </div>
        <div>
          <label className="field-label">Bio</label>
          <textarea rows={4} className="input w-full resize-none" value={os.bio ?? ''} onChange={(e) => patch({ bio: e.target.value })} placeholder="A short, punchy bio in your voice…" />
        </div>
        <div>
          <label className="field-label">Contact email</label>
          <input type="email" className="input w-full" value={os.contactEmail ?? ''} onChange={(e) => patch({ contactEmail: e.target.value })} placeholder="you@yourdomain.com" />
        </div>
      </section>

      {/* topics */}
      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Signature talks</h2>
          <button onClick={() => patch({ topics: [...(os.topics ?? []), { title: '', description: '' }] })} className="btn-outline" style={{ padding: '6px 14px', fontSize: 'var(--text-sm)' }}>
            <Plus className="h-4 w-4" /> Add talk
          </button>
        </div>
        {(os.topics ?? []).length === 0 && <p className="text-sm text-muted">Add the 2–4 talks you’re known for.</p>}
        {(os.topics ?? []).map((t, i) => (
          <div key={i} className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-3">
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" value={t.title} onChange={(e) => setTopic(i, { title: e.target.value })} placeholder="Talk title" />
              <button onClick={() => patch({ topics: (os.topics ?? []).filter((_, j) => j !== i) })} className="text-faint hover:text-[color:var(--danger)]">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea rows={2} className="input w-full resize-none text-sm" value={t.description ?? ''} onChange={(e) => setTopic(i, { description: e.target.value })} placeholder="One or two sentences on the talk and its takeaways." />
          </div>
        ))}
      </section>

      {/* testimonials */}
      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title" style={{ marginBottom: 0 }}>Testimonials</h2>
          <button onClick={() => patch({ testimonials: [...(os.testimonials ?? []), { quote: '', author: '', role: '' }] })} className="btn-outline" style={{ padding: '6px 14px', fontSize: 'var(--text-sm)' }}>
            <Plus className="h-4 w-4" /> Add quote
          </button>
        </div>
        {(os.testimonials ?? []).length === 0 && <p className="text-sm text-muted">Social proof from past organizers builds trust fast.</p>}
        {(os.testimonials ?? []).map((t, i) => (
          <div key={i} className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-3">
            <div className="flex gap-2">
              <textarea rows={2} className="input flex-1 resize-none text-sm" value={t.quote} onChange={(e) => setTestimonial(i, { quote: e.target.value })} placeholder="“She brought the house down…”" />
              <button onClick={() => patch({ testimonials: (os.testimonials ?? []).filter((_, j) => j !== i) })} className="text-faint hover:text-[color:var(--danger)]">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" value={t.author ?? ''} onChange={(e) => setTestimonial(i, { author: e.target.value })} placeholder="Author" />
              <input className="input flex-1 text-sm" value={t.role ?? ''} onChange={(e) => setTestimonial(i, { role: e.target.value })} placeholder="Title, Company" />
            </div>
          </div>
        ))}
      </section>

      {/* save */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Publishing…' : 'Publish one-sheet'}
        </button>
        {msg && (
          <span className="text-sm" style={{ color: msg.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
