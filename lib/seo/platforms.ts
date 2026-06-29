// Website platforms the SEO tool can tailor its step-by-step instructions to.
export const SEO_PLATFORMS = [
  { id: 'custom', label: 'Custom code / HTML' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'wix', label: 'Wix' },
  { id: 'squarespace', label: 'Squarespace' },
  { id: 'webflow', label: 'Webflow' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'godaddy', label: 'GoDaddy' },
  { id: 'framer', label: 'Framer' },
  { id: 'other', label: 'Other / not sure' },
] as const;

export type SeoPlatformId = (typeof SEO_PLATFORMS)[number]['id'];

const LABELS: Record<string, string> = Object.fromEntries(
  SEO_PLATFORMS.map((p) => [p.id, p.label])
);

export function isPlatform(id: unknown): id is SeoPlatformId {
  return typeof id === 'string' && id in LABELS;
}

export function platformLabel(id: string): string {
  return LABELS[id] ?? 'Other / not sure';
}
