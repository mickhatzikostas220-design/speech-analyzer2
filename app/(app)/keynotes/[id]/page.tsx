// Keynote detail — the master keynote at the top, then the tailoring controls
// and every industry-specific version branching beneath it. Data is fetched
// server-side (RLS scopes it to the owner) and handed to the client workspace.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Keynote, KeynoteVariant } from '@/lib/keynotes/types';
import { KeynoteWorkspace } from './KeynoteWorkspace';

export const dynamic = 'force-dynamic';

export default async function KeynoteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: keynote } = await supabase
    .from('keynotes')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!keynote) notFound();

  const { data: variants } = await supabase
    .from('keynote_variants')
    .select('*')
    .eq('keynote_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/keynotes"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" /> All keynotes
      </Link>
      <KeynoteWorkspace
        initialKeynote={keynote as Keynote}
        initialVariants={(variants as KeynoteVariant[]) ?? []}
      />
    </div>
  );
}
