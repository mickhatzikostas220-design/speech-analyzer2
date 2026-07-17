// Guards Supabase Storage keys that reach the service-role (admin) client.
//
// The admin client bypasses row-level security, so any path handed to it for
// signing or deletion is trusted blindly. All user media in the `speeches`
// bucket is stored under a `${userId}/...` prefix (see the editor/script/
// clipflow upload routes), so a key belongs to the caller only when its first
// path segment is exactly their user id. Fields like `video_path`, `clips[].path`
// and `segments[].clips[].clipPath` are user-editable on a project row, so a
// user could otherwise point them at someone else's key and have the admin
// client sign or delete a file they don't own.
export function isOwnedStoragePath(path: unknown, userId: string): path is string {
  return typeof path === 'string' && path.startsWith(`${userId}/`);
}
