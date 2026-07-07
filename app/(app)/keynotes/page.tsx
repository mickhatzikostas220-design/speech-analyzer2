// Keynote Tailoring — home. Lists the speaker's saved master keynotes and lets
// them add a new one (paste text or upload a PDF/Word/text file). Each keynote
// links to its detail page, where it branches into industry-tailored versions.
import Link from 'next/link';
import { GitBranch, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Keynote } from '@/lib/keynotes/types';
import { NewKeynoteForm } from './NewKeynoteForm';

export const dynamic = 'force-dynamic';

export default async function KeynotesPage() {
  const supabase = createClient();

  const { data } = await supabase.from('keynotes').select('*').order('created_at', { ascending: false });
  const keynotes = (data as Keynote[]) ?? [];

  // Variant counts (RLS scopes to this user), so each card can say how many
  // industry versions already branch off it.
  const { data: variantRows } = await supabase.from('keynote_variants').select('keynote_id');
  const counts = new Map<string, number>();
  for (const v of (variantRows as { keynote_id: string }[]) ?? []) {
    counts.set(v.keynote_id, (counts.get(v.keynote_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Keynote Description Tailoring</p>
      <h1 className="display-h1 mb-1">Tailor your keynote to any industry</h1>
      <p className="mb-8 text-muted">
        Store your keynote once, then spin up industry-specific versions on demand. The core idea and
        your voice stay exactly the same — only the framing and examples change to fit the room.
      </p>

      <NewKeynoteForm />

      <h2 className="section-title mb-3 mt-10">Your keynotes</h2>
      {keynotes.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-faint" />
          <p className="text-sm text-muted">
            No keynotes yet. Add your first one above to start tailoring it to different industries.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {keynotes.map((k) => {
            const count = counts.get(k.id) ?? 0;
            return (
              <Link
                key={k.id}
                href={`/keynotes/${k.id}`}
                className="card block p-5 transition hover:-translate-y-0.5 hover:border-strong"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-strong">{k.title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-sunk)] px-2.5 py-1 text-xs font-bold text-muted">
                    <GitBranch className="h-3.5 w-3.5" />
                    {count} {count === 1 ? 'version' : 'versions'}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted">{k.description}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
