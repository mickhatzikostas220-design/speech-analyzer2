import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listUserProjects, saveProject, EDITOR_DIR } from '@/lib/editor/projects';
import { mkdir } from 'fs/promises';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await mkdir(EDITOR_DIR, { recursive: true });
    const projects = await listUserProjects(user.id);
    return NextResponse.json(projects);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[editor GET]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title } = await request.json();
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    await mkdir(EDITOR_DIR, { recursive: true });

    const project = {
      id: crypto.randomUUID(),
      userId: user.id,
      title,
      videoName: null,
      videoExt: null,
      videoDuration: null,
      status: 'empty' as const,
      clips: [],
      exportReady: false,
      createdAt: new Date().toISOString(),
    };

    await saveProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[editor POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
