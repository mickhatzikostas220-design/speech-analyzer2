import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProject, saveProject, videoPath, exportPath } from '@/lib/editor/projects';
import { exportSegments } from '@/lib/editor/ffmpeg';
import { existsSync, createReadStream, statSync } from 'fs';
import { Readable } from 'stream';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!project.videoExt || project.status !== 'ready')
    return NextResponse.json({ error: 'Process the video first' }, { status: 400 });

  const selected = project.clips.filter((c) => c.selected);
  if (selected.length === 0)
    return NextResponse.json({ error: 'No clips selected' }, { status: 400 });

  const inputPath = videoPath(params.id, project.videoExt);
  const outPath = exportPath(params.id);

  try {
    await exportSegments(
      inputPath,
      selected.map((c) => ({ start: c.start, end: c.end })),
      outPath
    );
    await saveProject({ ...project, exportReady: true });
    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Export failed';
    return NextResponse.json({ error }, { status: 500 });
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = exportPath(params.id);
  if (!existsSync(filePath))
    return NextResponse.json({ error: 'Export not ready' }, { status: 404 });

  const { size } = statSync(filePath);
  const stream = createReadStream(filePath);
  const safeName = project.title.replace(/[^a-z0-9]/gi, '_');

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${safeName}_edited.mp4"`,
    },
  });
}
