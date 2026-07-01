// Central config for the app's own AI calls (speech feedback, SEO tips, the SEO
// and analysis chatbots, ClipFlow's default key). These all run directly on
// OpenAI using OPENAI_API_KEY — the same key used for Whisper transcription.
//
// History: these calls used to route through OpenRouter (with a free-tier model)
// when OPENROUTER_API_KEY was set. That free model had a hard daily request cap,
// and once it was hit OpenRouter returned HTTP 429 "Provider returned error",
// which broke every AI feature at once. The app now talks to OpenAI only, which
// has no free-tier daily cap, so that failure mode is gone.
//
// Bring-your-own-key paths (AI Assistant, per-user ClipFlow keys) are separate:
// those use the user's own provider key and hit their provider directly.

import OpenAI from 'openai';

/** True when the app-wide AI key (OpenAI) is configured. */
export function hasAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Constructor options for the app-wide chat client. Pass straight into
 * `new OpenAI(...)`. Always OpenAI now.
 */
export function aiClientOptions(): { apiKey: string | undefined } {
  return { apiKey: process.env.OPENAI_API_KEY };
}

/**
 * The chat model to use. We run everything on OpenAI, so this is just the
 * OpenAI model name the caller asks for (e.g. "gpt-4o").
 */
export function chatModel(openaiModel: string): string {
  return openaiModel;
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
 * Run a chat completion on OpenAI. Pass the OpenAI model name (e.g. "gpt-4o")
 * plus the usual request params WITHOUT `model`.
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
  const openai = new OpenAI(aiClientOptions());
  return openai.chat.completions.create({
    ...params,
    model: openaiModel,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParams);
}
