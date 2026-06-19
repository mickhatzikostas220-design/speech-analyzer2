import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processProject } from '@/lib/clipflow/pipeline';

// The clipping pipeline. Status-driven and idempotent: the client polls this
// while a project is processing, and re-invoking simply resumes from the last
// saved phase — which is how 1-hour+ videos finish without a single long call.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: project } = await supabase
      .from('clipflow_projects')
      .select('id, status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (project.status === 'ready') return NextResponse.json({ status: 'ready' });

    const admin = createAdminClient();
    await processProject(admin, params.id);

    return NextResponse.json({ status: 'ready' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The pipeline already records the error on the project row.
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
