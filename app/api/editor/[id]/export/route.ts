import { NextResponse } from 'next/server';

// Export now runs in the browser using ffmpeg.wasm and triggers a direct download.
// This route is no longer used.
export async function POST() {
  return NextResponse.json({ error: 'Export runs in the browser' }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: 'Export runs in the browser' }, { status: 410 });
}
