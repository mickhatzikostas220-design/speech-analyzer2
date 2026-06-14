import Anthropic from '@anthropic-ai/sdk';

// Lazily instantiated so importing this module never throws when
// ANTHROPIC_API_KEY is unset (the SDK constructor throws if it can't resolve a
// key). Routes check `process.env.ANTHROPIC_API_KEY` and return a clean 503
// before the agent ever calls this.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
