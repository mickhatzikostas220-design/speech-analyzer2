// Memory API (single item) — edit or delete one remembered fact.
//   PATCH  /api/memory/:id  { content }  -> edit
//   DELETE /api/memory/:id               -> forget it
import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAdmin } from '@/lib/agent/server';
import { deleteMemory, updateMemory } from '@/lib/memory/store';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { admin, user } = auth;

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return NextResponse.json({ error: 'Memory cannot be empty.' }, { status: 400 });

  const row = await updateMemory(admin, user.id, params.id, content);
  if (!row) return NextResponse.json({ error: 'Could not update that memory.' }, { status: 404 });
  return NextResponse.json({ memory: row });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getUserAndAdmin();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const { admin, user } = auth;
  await deleteMemory(admin, user.id, params.id);
  return NextResponse.json({ ok: true });
}
