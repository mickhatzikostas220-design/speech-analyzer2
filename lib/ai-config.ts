// Central config for the app's own AI calls (speech feedback, SEO tips, the SEO
// and analysis chatbots, ClipFlow's default key). These run through OpenRouter
// when OPENROUTER_API_KEY is set, and fall back to OpenAI's API when it isn't.
//
// Why this works: OpenRouter exposes an OpenAI-compatible chat-completions API at
// a different base URL, so the same `openai` SDK talks to it by pointing baseURL
// at OpenRouter and prefixing model ids (gpt-4o -> openai/gpt-4o).
//
// Resilience: the OpenRouter default model is a free-tier one, which has strict
// rate limits and a daily cap. When that cap is hit OpenRouter returns HTTP 429
// ("Provider returned error"), which would otherwise break EVERY AI feature at
// once. `createChatCompletion` below runs each call through OpenRouter and, if it
// rate-limits or errors, automatically retries the same request directly on
// OpenAI (when OPENAI_API_KEY is set), so a throttled free tier degrades
// gracefully instead of taking the whole app down.
//
// What this does NOT touch:
//   - Whisper transcription (/api/transcribe, lib/openai.ts): OpenRouter has no
//     audio endpoint, so transcription always uses OPENAI_API_KEY directly.
//   - Bring-your-own-key paths (AI Assistant, per-user ClipFlow keys): those are
//     the user's own provider keys and hit their provider directly.

import OpenAI from 'openai';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** True when the app-wide AI calls should be routed through OpenRouter. */
export function usingOpenRouter(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** True when any app-wide AI key (OpenRouter or OpenAI) is configured. */
export function hasAiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Constructor options for the app-wide chat client: OpenRouter when configured,
 * otherwise OpenAI. Pass straight into `new OpenAI(...)`.
 */
export function aiClientOptions(): { apiKey: string | undefined; baseURL?: string } {
  if (process.env.OPENROUTER_API_KEY) {
    return { apiKey: process.env.OPENROUTER_API_KEY, baseURL: OPENROUTER_BASE_URL };
  }
  return { apiKey: process.env.OPENAI_API_KEY };
}

// The model the app uses when running on OpenRouter. Defaults to Meta's free
// Llama 4 Maverick via OpenRouter's free tier; override with OPENROUTER_MODEL
// (any OpenRouter slug, e.g. "openai/gpt-4o" or "anthropic/claude-3.5-sonnet").
const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

/**
 * Pick the chat model for the active provider. On OpenRouter we use
 * OPENROUTER_MODEL (default gpt-oss-120b). On a plain OpenAI key we use the bare
 * model passed in (the OpenAI fallback, e.g. "gpt-4o"), since OpenAI's own API
 * does not serve gpt-oss.
 */
export function chatModel(openaiFallbackModel: string): string {
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  }
  return openaiFallbackModel;
}

// True when we can fall back to OpenAI after an OpenRouter failure: we're on
// OpenRouter now AND a separate OpenAI key exists to retry against.
function canFallBackToOpenAI(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENAI_API_KEY);
}

// Which OpenRouter/OpenAI errors are worth retrying on OpenAI directly. The one
// that motivated this (free-tier exhaustion) is 429; we also cover 402 (out of
// credits), request timeouts, and any 5xx from the upstream provider.
function shouldFallBack(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status !== 'number') return false;
  return status === 429 || status === 402 || status === 408 || status >= 500;
}

type NonStreamingParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  'model'
>;
type StreamingParams = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  'model'
>;

/**
 * Run a chat completion through the app-wide provider with automatic failover.
 *
 * Pass the OpenAI model name (e.g. "gpt-4o") plus the usual request params
 * WITHOUT `model` — this picks the right model for whichever provider actually
 * serves the request. It first tries the app-wide client (OpenRouter when
 * configured); if that rate-limits or errors and an OpenAI key is available, it
 * transparently retries the identical request on OpenAI's own API so a throttled
 * OpenRouter free tier no longer breaks every AI feature at once.
 *
 * Overloaded so streaming callers get a Stream back and non-streaming callers
 * get a ChatCompletion, exactly like `openai.chat.completions.create`.
 */
export async function createChatCompletion(
  openaiModel: string,
  params: NonStreamingParams
): Promise<OpenAI.Chat.Completions.ChatCompletion>;
export async function createChatCompletion(
  openaiModel: string,
  params: StreamingParams
): Promise<import('openai/streaming').Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>;
export async function createChatCompletion(
  openaiModel: string,
  params: NonStreamingParams | StreamingParams
): Promise<unknown> {
  const primary = new OpenAI(aiClientOptions());
  try {
    return await primary.chat.completions.create({
      ...params,
      model: chatModel(openaiModel),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParams);
  } catch (err) {
    if (!canFallBackToOpenAI() || !shouldFallBack(err)) throw err;
    // OpenRouter is throttled/erroring — retry the same request on OpenAI.
    console.warn(
      `AI call failed on OpenRouter (status ${(err as { status?: number }).status}); ` +
        `falling back to OpenAI (${openaiModel}).`
    );
    const fallback = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return await fallback.chat.completions.create({
      ...params,
      model: openaiModel,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParams);
  }
}
