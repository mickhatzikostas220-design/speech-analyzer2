// The persona layer — the single source of "who this speaker is" that every AI
// feature reads so the whole app feels personal to the user.
//
// It merges two things we already collect:
//   1. The Brand Kit (profiles.brand) — captured at onboarding from the user's
//      website: their name, tagline, one-sheet bio + signature topics, brand
//      voice/tone, and a private `aiProfile` the user brought from their own AI.
//      This is populated for real users on day one.
//   2. Durable memory facts (user_memories) — things learned over time.
//
// Before this, only Content Ideas + Stage Finder read the Brand Kit, so tools
// like the SEO advisor knew the user's HTML but nothing about the user, which is
// why their tips felt generic. Every AI route should call getPersonaContext()
// (for a prompt block) or getPersona() (for structured fields).
//
// Design mirrors lib/memory/store.ts: an explicit (supabase, userId) pair so both
// the cookie-scoped server client and the service-role admin client can call in.
// Fully defensive — any failure degrades to an empty persona, never throws.

import type { SupabaseClient } from '@supabase/supabase-js';
import { mergeBrand } from '@/lib/brand/theme';
import { DEFAULT_BRAND } from '@/lib/brand/defaults';
import { getMemoryFacts } from '@/lib/memory/store';

export interface Persona {
  /** Speaker/display name, when we have a real (non-default) one. */
  name: string | null;
  /** The website their brand was extracted from, if any. */
  websiteUrl: string | null;
  /** Signature talk topics (from the one-sheet). */
  topics: string[];
  /** Public-ish bio / about text. */
  bio: string;
  /** Private speaker profile the user brought from their own AI at onboarding. */
  aiProfile: string;
  /** Brand voice/tone, when the user set a real one (not the seed default). */
  tone: string;
  /** Durable remembered facts, newest first. */
  memoryFacts: string[];
  /** True when we actually know something personal (brand or memory). */
  hasAny: boolean;
}

const EMPTY: Persona = {
  name: null,
  websiteUrl: null,
  topics: [],
  bio: '',
  aiProfile: '',
  tone: '',
  memoryFacts: [],
  hasAny: false,
};

/**
 * Load everything we know about a speaker: their Brand Kit fields + memory facts.
 * Returns an all-empty persona on any error or for brand-less (default-kit) users.
 */
export async function getPersona(
  supabase: SupabaseClient,
  userId: string
): Promise<Persona> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('brand, website_url, display_name')
      .eq('id', userId)
      .maybeSingle();

    const brand = mergeBrand((data?.brand as unknown) ?? undefined);
    // The seed/default kit isn't a real speaker — don't treat it as identity.
    const hasRealBrand = brand.source !== 'default';

    const name =
      (hasRealBrand && brand.name && brand.name !== DEFAULT_BRAND.name ? brand.name : '') ||
      (typeof data?.display_name === 'string' ? data.display_name : '') ||
      null;

    const websiteUrl =
      (typeof data?.website_url === 'string' && data.website_url) ||
      (hasRealBrand ? brand.sourceUrl || '' : '') ||
      null;

    const topics = hasRealBrand
      ? (brand.oneSheet?.topics ?? []).map((t) => t.title).filter(Boolean)
      : [];
    const bio = hasRealBrand ? brand.oneSheet?.bio || brand.voice?.about || '' : '';
    const aiProfile = hasRealBrand ? brand.voice?.aiProfile || '' : '';
    const tone =
      hasRealBrand && brand.voice?.tone && brand.voice.tone !== DEFAULT_BRAND.voice.tone
        ? brand.voice.tone
        : '';

    const memoryFacts = await getMemoryFacts(supabase, userId);

    const hasAny = Boolean(
      name || websiteUrl || topics.length || bio || aiProfile || tone || memoryFacts.length
    );

    return { name, websiteUrl, topics, bio, aiProfile, tone, memoryFacts, hasAny };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Render a persona as a compact prompt block, ready to drop into a system message
 * or splice into a prompt. Returns '' when we know nothing, so callers can safely
 * concatenate. Bounded so it can't blow the context window.
 */
export function personaToBlock(p: Persona): string {
  const bits: string[] = [];
  if (p.name) bits.push(`Name: ${p.name}`);
  if (p.websiteUrl) bits.push(`Website: ${p.websiteUrl}`);
  if (p.topics.length) bits.push(`Speaks on: ${p.topics.join('; ')}`);
  if (p.bio) bits.push(`Bio: ${p.bio}`);
  if (p.aiProfile) bits.push(`Speaker profile: ${p.aiProfile}`);
  if (p.tone) bits.push(`Brand voice/tone: ${p.tone}`);
  for (const f of p.memoryFacts) bits.push(`Remembered: ${f}`);
  if (bits.length === 0) return '';
  return [
    'WHO THIS SPEAKER IS (personalize to this — use their real name, topics, audience, and voice; never contradict or invent beyond it):',
    ...bits.map((b) => `- ${b}`),
  ]
    .join('\n')
    .slice(0, 2000);
}

/**
 * One-call convenience: the persona as a ready-to-inject prompt block ('' when we
 * know nothing). This is the hook every AI route should use.
 */
export async function getPersonaContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  return personaToBlock(await getPersona(supabase, userId));
}
