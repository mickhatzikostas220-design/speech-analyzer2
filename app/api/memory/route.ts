// Memory API (collection) — powers Settings → Memory.
//   GET   /api/memory            -> { enabled, memories }
//   POST  /api/memory  { content, category? }  -> add an explicit memory
//   PATCH /api/memory  { enabled }             -> turn memory on/off
//
// Auth via the signed-in session; data access via the service-role admin client
// filtered by user_id (same pattern as the agent routes). Free for all tiers.
import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import {
  listMemories,
  saveMemory,
  isMemoryEnabled,
  setMemoryEnabled,
} from '@/lib/memory/store';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { admin, user } = auth;
  const [memories, enabled] = await Promise.all([
    listMemories(admin, user.id),
    isMemoryEnabled(admin, user.id),
  ]);
  return NextResponse.json({ enabled, memories });
}

export async function POST(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { admin, user } = auth;

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return NextResponse.json({ error: 'Nothing to remember.' }, { status: 400 });

  if (!(await isMemoryEnabled(admin, user.id))) {
    return NextResponse.json({ error: 'Memory is turned off. Turn it on first.' }, { status: 400 });
  }

  const row = await saveMemory(admin, user.id, content, {
    category: body.category,
    source: 'explicit',
  });
  if (!row) {
    return NextResponse.json({ error: 'Already remembered (or nothing to save).' }, { status: 409 });
  }
  return NextResponse.json({ memory: row });
}

export async function PATCH(request: NextRequest) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { admin, user } = auth;

  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Missing enabled flag.' }, { status: 400 });
  }
  await setMemoryEnabled(admin, user.id, body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
