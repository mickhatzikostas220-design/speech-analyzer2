// Minimal HTML entity escaping for user-supplied strings that get interpolated
// into HTML we generate on the server (emails, the admin one-click action page).
// Prevents stored XSS / HTML injection from public form input.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
