import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProject, saveProject } from '@/lib/editor/projects';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { clips } = await request.json();
  await saveProject({ ...project, clips, exportReady: false });
  return NextResponse.json({ success: true });
}
