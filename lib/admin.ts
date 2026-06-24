import type { User } from '@supabase/supabase-js';

/**
 * Single source of truth for who counts as an admin. Previously this email was
 * duplicated across several routes and the admin layout (one with no env
 * override at all), which is brittle and easy to get out of sync.
 *
 * Configure via ADMIN_EMAILS (comma-separated) or ADMIN_EMAIL. Falls back to
 * the project owner's address so existing deployments keep working, but you
 * should set the env var in production.
 */
function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? 'mickhatzikostas220@gmail.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export function isAdminUser(user: Pick<User, 'email'> | null | undefined): boolean {
  return isAdminEmail(user?.email ?? null);
}
