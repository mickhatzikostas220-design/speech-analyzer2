// Stage Finder web-search helper. Uses the OpenAI Responses API with the built-in
// web_search tool to gather REAL, currently-documented facts BEFORE we structure a
// report — specifically (1) where the admired speakers have actually spoken and
// (2) real, current events/series in their world that book outside speakers. The
// facts (and their source URLs) are then handed to the normal JSON call so the
// report is grounded in what was actually found, not the model's memory.
//
// Why the Responses API + web_search tool (and not the gpt-4o-search-preview chat
// model): the *-search-preview chat models are deprecated and shut down
// 2026-07-23, whereas the web_search tool runs on a normal, supported model
// (gpt-4o). We keep this out of ai-config's chat wrapper because it hits a
// different endpoint (responses.create, not chat.completions) and returns
// citations, which that wrapper isn't shaped for.

import OpenAI from 'openai';
import { aiClientOptions } from '@/lib/ai-config';

/** One web source the model cited while researching. */
export interface WebSource {
  url: string;
  title: string;
}

/** The result of one web-search research pass. */
export interface WebSearchFindings {
  /** The model's plain-text research brief. */
  text: string;
  /** De-duplicated source URLs the model cited. */
  sources: WebSource[];
}

// Minimal shapes for reading Responses output WITHOUT depending on the exact SDK
// union types (which shift across openai-node versions). We narrow defensively so
// a shape change degrades to "no sources" rather than a crash.
interface LooseAnnotation {
  type?: string;
  url?: unknown;
  title?: unknown;
}
interface LooseContentPart {
  type?: string;
  annotations?: unknown;
}
interface LooseOutputItem {
  type?: string;
  content?: unknown;
}

/** Pull url_citation annotations out of a Responses API output array. */
function extractSources(output: unknown): WebSource[] {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  if (!Array.isArray(output)) return sources;
  for (const rawItem of output) {
    const item = rawItem as LooseOutputItem;
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const rawPart of item.content) {
      const part = rawPart as LooseContentPart;
      if (!Array.isArray(part.annotations)) continue;
      for (const rawAnn of part.annotations) {
        const ann = rawAnn as LooseAnnotation;
        if (ann.type === 'url_citation' && typeof ann.url === 'string' && ann.url && !seen.has(ann.url)) {
          seen.add(ann.url);
          sources.push({
            url: ann.url,
            title: typeof ann.title === 'string' && ann.title ? ann.title : ann.url,
          });
        }
      }
    }
  }
  return sources;
}

/**
 * Run one web-search research pass and return the findings brief + cited sources.
 * Throws on API error — the caller decides whether to degrade gracefully.
 */
export async function runWebSearch(prompt: string): Promise<WebSearchFindings> {
  const openai = new OpenAI(aiClientOptions());
  const response = await openai.responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: prompt,
    max_output_tokens: 2000,
  });
  return {
    text: response.output_text ?? '',
    sources: extractSources(response.output),
  };
}
