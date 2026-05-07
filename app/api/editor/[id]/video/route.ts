import { NextResponse } from 'next/server';

// Videos are now served via Supabase Storage signed URLs.
// This route is no longer used.
export async function GET() {
  return NextResponse.json({ error: 'Use the signed URL from GET /api/editor/[id]' }, { status: 410 });
}
