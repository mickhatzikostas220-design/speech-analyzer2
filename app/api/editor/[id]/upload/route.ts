import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProject, saveProject, projectDir, videoPath } from '@/lib/editor/projects';
import { getVideoDuration } from '@/lib/editor/ffmpeg';
import { writeFile, mkdir } from 'fs/promises';
import { extname } from 'path';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('video') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = extname(file.name) || '.mp4';
  const dir = projectDir(params.id);
  await mkdir(dir, { recursive: true });

  const filePath = videoPath(params.id, ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  let duration: number | null = null;
  try {
    duration = await getVideoDuration(filePath);
  } catch { /* ffprobe failed — duration stays null */ }

  await saveProject({
    ...project,
    videoName: file.name,
    videoExt: ext,
    videoDuration: duration,
    status: 'empty',
    clips: [],
    exportReady: false,
  });

  return NextResponse.json({ success: true, duration });
}
