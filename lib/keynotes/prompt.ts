// Builds the GPT-4o prompt that tailors a master keynote description to a
// specific industry. The guiding principle (and the whole point of the tool):
// KEEP the speaker's voice, core idea, and structure — only re-frame the
// context, examples, and stakes so they land for the target audience.
//
// The rules below come from how speaker bureaus and event organizers actually
// evaluate keynote descriptions: one clear core idea, audience-relevant framing,
// concrete outcomes/stakes for THIS room, and the speaker's authentic voice —
// without inventing credentials or fake statistics.

export function buildTailorPrompt(params: {
  title: string;
  description: string;
  industry: string;
  audience?: string;
}): string {
  const { title, description, industry, audience } = params;
  const audienceLine = audience
    ? `\nWithin that industry, the specific audience is: ${audience}. Speak to their day-to-day reality.`
    : '';

  return `You are an expert speaking-industry copywriter who tailors keynote descriptions for professional speakers pitching to event organizers.

You will be given a speaker's MASTER keynote description. Your job is to adapt it for a specific industry so it feels written for that room — WITHOUT changing the talk itself.

TARGET INDUSTRY: ${industry}${audienceLine}

KEYNOTE TITLE: ${title}

MASTER DESCRIPTION:
"""
${description}
"""

NON-NEGOTIABLE RULES:
1. PRESERVE the core idea, message, and takeaway exactly. This is the same talk — do not change what it is about or its central thesis.
2. PRESERVE the speaker's tone and voice — same energy, personality, and reading level. If it's warm and story-driven, keep it warm and story-driven; if it's punchy and bold, keep it punchy and bold.
3. PRESERVE the overall structure and length. Aim within ~15% of the original word count. Do not pad it out or trim it down.
4. ONLY re-frame the industry-facing surface: swap generic examples for ones that resonate in ${industry}, reference this audience's real pain points, priorities, and desired outcomes, and use terminology they actually use.
5. DO NOT invent facts, statistics, client names, credentials, or results that are not in the original. If the original has no numbers, don't add numbers. You may generalize an existing example into an ${industry} context, but never fabricate a specific claim.
6. DO NOT add a title, headline, label, preamble, or sign-off. Return only the description prose itself.

Respond with ONLY valid JSON in this exact shape (no markdown, no code fences):
{
  "tailored": "the full re-framed description, ready to paste",
  "changes": ["short bullet naming one thing you re-framed for ${industry}", "another", "another"]
}
The "changes" array should have 2–4 short, concrete bullets so the speaker can see exactly what was adapted (not a rewrite). Keep each bullet under 15 words.`;
}
