import { NextResponse } from 'next/server';

// Silence detection now runs in the browser using ffmpeg.wasm.
// This route is no longer used.
export async function POST() {
  return NextResponse.json({ error: 'Processing runs in the browser' }, { status: 410 });
}
