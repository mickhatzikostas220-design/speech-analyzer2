import type { Provider } from './types';

// Curated models shown in the settings picker. Users can also type any custom
// model ID for their provider (e.g. a newer or larger model) via the settings UI.
export const MODEL_OPTIONS: { provider: Provider; id: string; label: string }[] = [
  { provider: 'anthropic', id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
  { provider: 'anthropic', id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast & cheap' },
  { provider: 'openai', id: 'gpt-4o', label: 'GPT-4o — balanced' },
  { provider: 'openai', id: 'gpt-4o-mini', label: 'GPT-4o mini — fast & cheap' },
];

export const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
};

export function isProvider(value: unknown): value is Provider {
  return value === 'anthropic' || value === 'openai';
}
