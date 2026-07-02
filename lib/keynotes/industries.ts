// Quick-pick industry suggestions for the Keynote Tailoring tool. These are
// only shortcuts — speakers can type ANY industry or audience they like, so the
// tool can tailor to niche rooms (e.g. "K-12 education", "oil & gas") too.

export const SUGGESTED_INDUSTRIES = [
  'Technology & SaaS',
  'Healthcare',
  'Finance & Banking',
  'Education',
  'Retail & E-commerce',
  'Manufacturing',
  'Real Estate',
  'Nonprofit',
  'Government & Public Sector',
  'Hospitality & Travel',
  'Energy & Utilities',
  'Legal',
  'Insurance',
  'Marketing & Advertising',
  'Sales',
] as const;

/**
 * Normalize a user-supplied industry/audience string: trim, collapse internal
 * whitespace, and cap the length so it stays a short label. Returns '' when the
 * input is effectively empty.
 */
export function cleanIndustry(input: unknown, max = 80): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\s+/g, ' ').slice(0, max);
}
