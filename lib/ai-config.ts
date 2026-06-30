// Central config for the app's own AI calls (speech feedback, SEO tips, the SEO
// and analysis chatbots, ClipFlow's default key). These run through OpenRouter
// when OPENROUTER_API_KEY is set, and fall back to OpenAI's API when it isn't.
//
// Why this works: OpenRouter exposes an OpenAI-compatible chat-completions API at
// a different base URL, so the same `openai` SDK talks to it by pointing baseURL
// at OpenRouter and prefixing model ids (gpt-4o -> openai/gpt-4o).
//
// What this does NOT touch:
//   - Whisper transcription (/api/transcribe, lib/openai.ts): OpenRouter has no
//     audio endpoint, so transcription always uses OPENAI_API_KEY directly.
//   - Bring-your-own-key paths (AI Assistant, per-user ClipFlow keys): those are
//     the user's own provider keys and hit their provider directly.

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
const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-4-maverick:free';

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
