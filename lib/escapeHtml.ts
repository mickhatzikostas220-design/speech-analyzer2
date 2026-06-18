/**
 * Escape a string for safe interpolation into HTML markup.
 * Use this for any user-controlled value (names, emails, free text from the
 * public access-request form) before embedding it in an HTML page or email.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
