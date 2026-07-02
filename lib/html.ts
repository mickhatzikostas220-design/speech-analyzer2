// Escape a string for safe interpolation into HTML (emails, server-rendered
// pages). Prevents HTML/script injection when user-supplied text — e.g. the
// public request-access form fields — ends up in markup.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
