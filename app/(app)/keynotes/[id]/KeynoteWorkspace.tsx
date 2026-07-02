'use client';

// Interactive workspace for one keynote. Shows the master description (editable),
// the tailoring controls (industry + optional audience), and every generated
// industry version branching beneath it. Generating a version calls the tailor
// API, which re-frames the master for that industry while keeping its tone and
// core idea intact.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Trash2,
  Pencil,
  GitBranch,
} from 'lucide-react';
import { SUGGESTED_INDUSTRIES } from '@/lib/keynotes/industries';
import type { Keynote, KeynoteVariant } from '@/lib/keynotes/types';

export function KeynoteWorkspace({
  initialKeynote,
  initialVariants,
}: {
  initialKeynote: Keynote;
  initialVariants: KeynoteVariant[];
}) {
  const router = useRouter();
  const [keynote, setKeynote] = useState<Keynote>(initialKeynote);
  const [variants, setVariants] = useState<KeynoteVariant[]>(initialVariants);

  // Master edit state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(initialKeynote.title);
  const [editDesc, setEditDesc] = useState(initialKeynote.description);
  const [savingMaster, setSavingMaster] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);

  // Tailoring state
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [tailoring, setTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);
  // "What I adapted" bullets + industry analysis, per freshly-generated variant (not persisted).
  const [changesById, setChangesById] = useState<Record<string, string[]>>({});
  const [analysisById, setAnalysisById] = useState<Record<string, string[]>>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function saveMaster() {
    setMasterError(null);
    if (!editTitle.trim()) {
      setMasterError('Title can’t be empty.');
      return;
    }
    if (editDesc.trim().length < 40) {
      setMasterError('Description is too short to tailor.');
      return;
    }
    setSavingMaster(true);
    try {
      const res = await fetch(`/api/keynotes/${keynote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim(), description: editDesc.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMasterError(data.error || 'Couldn’t save your changes.');
      } else {
        setKeynote(data as Keynote);
        setEditing(false);
      }
    } catch {
      setMasterError('Network error. Please try again.');
    } finally {
      setSavingMaster(false);
    }
  }

  async function deleteKeynote() {
    if (!confirm('Delete this keynote and all its industry versions? This can’t be undone.')) return;
    try {
      const res = await fetch(`/api/keynotes/${keynote.id}`, { method: 'DELETE' });
      if (res.ok) router.push('/keynotes');
    } catch {
      /* leave the user on the page if the delete request fails */
    }
  }

  async function tailor() {
    setTailorError(null);
    if (!industry.trim()) {
      setTailorError('Type an industry to tailor this to.');
      return;
    }
    setTailoring(true);
    try {
      const res = await fetch(`/api/keynotes/${keynote.id}/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: industry.trim(), audience: audience.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTailorError(data.error || 'Couldn’t tailor that right now. Please try again.');
      } else {
        const variant = data.variant as KeynoteVariant;
        const changes = Array.isArray(data.changes) ? (data.changes as string[]) : [];
        const analysis = Array.isArray(data.industry_analysis) ? (data.industry_analysis as string[]) : [];
        setVariants((cur) => [variant, ...cur]);
        setChangesById((cur) => ({ ...cur, [variant.id]: changes }));
        setAnalysisById((cur) => ({ ...cur, [variant.id]: analysis }));
        setIndustry('');
        setAudience('');
      }
    } catch {
      setTailorError('Network error. Please try again.');
    } finally {
      setTailoring(false);
    }
  }

  async function deleteVariant(id: string) {
    setVariants((cur) => cur.filter((v) => v.id !== id));
    try {
      await fetch(`/api/keynotes/variants/${id}`, { method: 'DELETE' });
    } catch {
      /* optimistic remove; a failed request just means it reappears on refresh */
    }
  }

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  return (
    <div>
      {/* Master keynote — the trunk */}
      <div className="card p-6">
        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="input w-full text-sm font-semibold"
              placeholder="Keynote title"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={8}
              className="input w-full resize-y text-sm"
              placeholder="Keynote description"
            />
            {masterError && (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>
                {masterError}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={saveMaster} disabled={savingMaster} className="btn-primary text-sm">
                {savingMaster ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditTitle(keynote.title);
                  setEditDesc(keynote.description);
                  setMasterError(null);
                }}
                className="btn-outline text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow mb-1">Master keynote</p>
                <h1 className="display-h1" style={{ fontSize: 'var(--text-h2)' }}>
                  {keynote.title}
                </h1>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-[var(--radius-sm)] p-2 text-muted transition-colors hover:bg-[var(--surface-sunk)] hover:text-strong"
                  aria-label="Edit keynote"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={deleteKeynote}
                  className="rounded-[var(--radius-sm)] p-2 text-muted transition-colors hover:bg-[var(--danger-bg)] hover:text-[color:var(--danger)]"
                  aria-label="Delete keynote"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">{keynote.description}</p>
          </>
        )}
      </div>

      {/* Tailoring controls */}
      <div className="card mt-5 p-6">
        <h2 className="section-title mb-1">Tailor to an industry</h2>
        <p className="mb-4 text-sm text-muted">
          Same idea, same voice — only the framing and examples change to fit the room.
        </p>

        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Type any industry — e.g. fintech, K-12 education, oil & gas"
          className="input w-full text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !tailoring) tailor();
          }}
        />

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {SUGGESTED_INDUSTRIES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setIndustry(s)}
              className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-strong hover:text-strong"
            >
              {s}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Optional: a specific audience within it — e.g. C-suite executives, front-line nurses"
          className="input mt-3 w-full text-sm"
        />

        {tailorError && (
          <p
            className="mt-3 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm"
            style={{ color: 'var(--danger)' }}
          >
            {tailorError}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={tailor} disabled={tailoring} className="btn-primary">
            {tailoring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Tailoring…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Tailor to this industry
              </>
            )}
          </button>
        </div>
      </div>

      {/* Branches — one per industry version */}
      <div className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted" />
          <h2 className="section-title">
            Industry versions{variants.length > 0 ? ` (${variants.length})` : ''}
          </h2>
        </div>

        {variants.length === 0 ? (
          <p className="text-sm text-muted">
            No industry versions yet. Pick an industry above and tailor your first one.
          </p>
        ) : (
          <div className="relative space-y-4 pl-6">
            {/* vertical trunk line connecting the branches */}
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-[var(--border-default)]" />
            {variants.map((v) => {
              const changes = changesById[v.id];
              const analysis = analysisById[v.id];
              return (
                <div key={v.id} className="relative">
                  <span className="absolute -left-[21px] top-6 h-2.5 w-2.5 rounded-full bg-[var(--signature)] ring-4 ring-[color:var(--surface-page)]" />
                  <div className="card p-5">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-strong">{v.industry}</p>
                        {v.audience && <p className="text-xs text-muted">for {v.audience}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => copyText(v.id, v.tailored_description)}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-[var(--surface-sunk)] hover:text-strong"
                        >
                          {copiedId === v.id ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Copy
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => deleteVariant(v.id)}
                          className="rounded-[var(--radius-sm)] p-1.5 text-muted transition-colors hover:bg-[var(--danger-bg)] hover:text-[color:var(--danger)]"
                          aria-label="Delete version"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-body">
                      {v.tailored_description}
                    </p>

                    {/* Industry context & adaptation details */}
                    <div className="mt-4 space-y-2.5">
                      {analysis && analysis.length > 0 && (
                        <div className="rounded-[var(--radius-sm)] bg-[var(--surface-sunk)] px-3 py-2.5">
                          <p className="mb-1 text-xs font-bold text-strong">Industry context that shaped this</p>
                          <ul className="space-y-0.5">
                            {analysis.map((a, i) => (
                              <li key={i} className="text-xs text-muted">
                                • {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {changes && changes.length > 0 && (
                        <div className="rounded-[var(--radius-sm)] bg-[var(--surface-sunk)] px-3 py-2.5">
                          <p className="mb-1 text-xs font-bold text-strong">What I adapted for {v.industry}</p>
                          <ul className="space-y-0.5">
                            {changes.map((c, i) => (
                              <li key={i} className="text-xs text-muted">
                                • {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
