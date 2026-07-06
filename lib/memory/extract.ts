// Auto-capture: read a finished interaction and quietly remember the durable
// facts in it. Runs on the app-wide OpenAI key (gpt-4o-mini — pennies per call)
// so it works for every tier, independent of the Full-Premium bring-your-own-key
// Assistant. Designed to be fire-and-forget: it never throws and never blocks the
// response that triggered it (callers should not await it).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createChatCompletion, hasAiKey } from '@/lib/ai-config';
import { getMemoryFacts, isMemoryEnabled, saveMemory } from './store';

const EXTRACTOR_SYSTEM = `You extract durable, personal facts about a user from a conversation so an app can remember them later and feel personal.

Only extract things that are TRUE ABOUT THE USER and USEFUL LATER, such as:
- their name, role, company, or where they speak
- their goals ("wants to land a TED talk"), upcoming events ("keynote in March"), or deadlines
- lasting preferences about how they want help ("prefers blunt feedback", "hates filler words")
- their speaking topics, audience, or style
- stable facts about their work or life they clearly want acknowledged

Do NOT extract:
- one-off requests, questions, or task instructions
- transient state ("is tired today")
- anything the assistant said, or anything not about the user
- guesses — only what the user actually stated or clearly implied

Rewrite each as a short, standalone third-person fact ("Speaks about leadership to Fortune 500 audiences.") — not a quote, no "the user said".

Quality bar (be strict — a wrong or noisy memory is worse than none):
- Only capture facts that will STILL be true and useful weeks from now. When in doubt, leave it out.
- You may be given a list of facts already remembered. Do NOT return anything that repeats or is a trivial reword of one of those. Only return genuinely NEW information. If a fact meaningfully UPDATES a known one (e.g. a new date, a changed goal), return the full updated fact.
- Prefer one precise fact over several vague ones. Never pad the list.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"goal|preference|fact|event|style|other"}]}. If there is nothing worth remembering, return {"memories":[]}. Never invent facts.`;

interface ExtractedMemory {
  content: string;
  category: string;
}

/**
 * Extract durable facts from `text` and save any new ones for the user.
 * Returns the memories actually stored (may be empty). Swallows all errors.
 *
 * `text` should be the user's own words (optionally with light context). We do
 * not feed long transcripts — keep it to the turn(s) that just happened.
 */
export async function captureMemories(
  supabase: SupabaseClient,
  userId: string,
  text: string
): Promise<number> {
  try {
    const trimmed = (text ?? '').trim();
    if (!trimmed || trimmed.length < 12) return 0;
    if (!hasAiKey()) return 0;
    if (!(await isMemoryEnabled(supabase, userId))) return 0;

    // Give the extractor the facts we already know so it won't re-capture
    // duplicates or trivial rewordings — the main source of memory noise.
    const known = await getMemoryFacts(supabase, userId);
    const knownBlock = known.length
      ? `Facts already remembered (do NOT repeat or reword these — only return NEW information):\n${known
          .map((f) => `- ${f}`)
          .join('\n')}\n\n`
      : '';

    const completion = await createChatCompletion('gpt-4o-mini', {
      max_tokens: 500,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTOR_SYSTEM },
        { role: 'user', content: `${knownBlock}Conversation to extract from:\n${trimmed.slice(0, 6000)}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { memories?: unknown };
    const list = Array.isArray(parsed.memories) ? parsed.memories : [];

    let saved = 0;
    for (const item of list.slice(0, 8)) {
      const m = item as ExtractedMemory;
      if (!m || typeof m.content !== 'string') continue;
      const row = await saveMemory(supabase, userId, m.content, {
        category: m.category,
        source: 'auto',
      });
      if (row) saved += 1;
    }
    return saved;
  } catch {
    return 0;
  }
}
