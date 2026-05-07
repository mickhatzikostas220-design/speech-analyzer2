import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProject, videoPath } from '@/lib/editor/projects';
import { createReadStream, statSync, existsSync } from 'fs';
import { Readable } from 'stream';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project = await getProject(params.id);
  if (!project || project.userId !== user.id)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!project.videoExt) return NextResponse.json({ error: 'No video' }, { status: 404 });

  const filePath = videoPath(params.id, project.videoExt);
  if (!existsSync(filePath)) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const { size } = statSync(filePath);
  const contentType = MIME[project.videoExt.toLowerCase()] ?? 'video/mp4';
  const range = request.headers.get('range');

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : size - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Content-Type': contentType,
    },
  });
}
