import { NextResponse } from 'next/server';

// Video upload now goes directly from the browser to Supabase Storage.
// This route is no longer used.
export async function POST() {
  return NextResponse.json({ error: 'Upload directly to Supabase Storage from the browser' }, { status: 410 });
}
