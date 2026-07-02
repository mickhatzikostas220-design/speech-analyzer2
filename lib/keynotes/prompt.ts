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
  const audienceLine = audience ? `\n- Specific audience within ${industry}: ${audience}` : '';

  return `You are an expert keynote copywriter specializing in meaningful, authentic industry-specific adaptations.

Your task: Take a master keynote description and tailor it for a specific industry so it feels like it was written for that audience—not a generic talk with industry terms swapped in.

MASTER KEYNOTE:
Title: ${title}

Description:
"""
${description}
"""

TARGET INDUSTRY: ${industry}${audienceLine}

---

## STEP 1: Analyze the Industry

Before rewriting, identify 3–5 key business, leadership, sales, and cultural challenges professionals in ${industry} face today. Consider:
- Unique pressures and market conditions
- Competitive landscape and customer expectations
- Regulatory or operational constraints (if applicable)
- How technology, workforce changes, or industry trends are reshaping their world
- What builds trust and differentiates leaders in this space

## STEP 2: Rewrite with Industry Context

Now rewrite the description using your analysis from Step 1. Follow these principles:

**PRESERVE:**
- Core idea and central thesis—this is the same talk, just re-framed
- Overall structure and length (±15% of original word count)
- Speaker's authentic voice and personality (conversational, energetic, practical—avoid corporate jargon)
- Learning outcomes and takeaways; make them specific to this industry while keeping the intent

**ADAPT MEANINGFULLY:**
- Examples and stories: Replace generic examples with ones that resonate in ${industry}. Use specific challenges, situations, and wins professionals here recognize
- Pain points: Reference the real pressures and frustrations ${industry} leaders face
- Opportunities: Highlight how the keynote's core idea helps professionals in this industry build trust, differentiate themselves, navigate change, improve outcomes, and drive results
- Language: Use terminology professionals in this industry actually use, but never sacrifice the speaker's voice for buzzwords
- Current context: Weave in relevant industry trends (AI, workforce challenges, regulation, customer expectations, etc.) naturally where they fit

**DO NOT:**
- Invent statistics, client names, credentials, or results not in the original
- Change the essence of what the keynote is about
- Add titles, preambles, or sign-offs
- Make it feel like a template with industry words inserted—it should read as if originally written for this audience

---

Respond with ONLY valid JSON in this exact shape (no markdown, no code fences):
{
  "industry_analysis": ["challenge 1", "challenge 2", "challenge 3"],
  "tailored": "the full re-framed description, ready to paste",
  "changes": ["meaningful adaptation 1", "meaningful adaptation 2", "meaningful adaptation 3"]
}

Keep each bullet under 15 words. The "changes" array should highlight what you meaningfully adapted, not just surface swaps.`;
}
