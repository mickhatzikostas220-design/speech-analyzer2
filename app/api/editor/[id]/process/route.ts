import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProject, saveProject, videoPath } from '@/lib/editor/projects';
import { detectSpeechSegments } from '@/lib/editor/ffmpeg';
import { existsSync } from 'fs';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!project.videoExt)
    return NextResponse.json({ error: 'No video uploaded' }, { status: 400 });

  const filePath = videoPath(params.id, project.videoExt);
  if (!existsSync(filePath))
    return NextResponse.json({ error: 'Video file missing' }, { status: 400 });

  await saveProject({ ...project, status: 'processing' });

  try {
    const segments = await detectSpeechSegments(filePath);
    const clips = segments.map((seg) => ({
      id: crypto.randomUUID(),
      start: Math.round(seg.start * 100) / 100,
      end: Math.round(seg.end * 100) / 100,
      selected: true,
    }));

    await saveProject({ ...project, status: 'ready', clips, exportReady: false });
    return NextResponse.json({ clips });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Processing failed';
    await saveProject({ ...project, status: 'error', error });
    return NextResponse.json({ error }, { status: 500 });
  }
}
