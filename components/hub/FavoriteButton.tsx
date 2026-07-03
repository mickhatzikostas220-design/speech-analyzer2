'use client';

// The star toggle shown on each hub tool card. Clicking it pins/unpins the tool
// so it appears in the top bar. It updates optimistically for instant feedback,
// then reconciles with the authoritative list the server action returns, and
// refreshes so the Navbar's pinned tray reflects the change.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { setToolFavorite } from '@/lib/tools/actions';

export function FavoriteButton({
  toolKey,
  toolName,
  initialFavorited,
}: {
  toolKey: string;
  toolName: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(e: React.MouseEvent) {
    // The card is a link; keep a star click from navigating.
    e.preventDefault();
    e.stopPropagation();

    const next = !favorited;
    setFavorited(next); // optimistic

    startTransition(async () => {
      const list = await setToolFavorite(toolKey, next);
      // Reconcile against the server's truth in case the write was rejected.
      setFavorited(list.includes(toolKey));
      router.refresh(); // update the Navbar's pinned tray
    });
  }

  const label = favorited ? `Unpin ${toolName} from the top bar` : `Pin ${toolName} to the top bar`;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={label}
      title={favorited ? 'Pinned to top bar' : 'Pin to top bar'}
      className={`rounded-full p-1.5 transition-colors disabled:opacity-60 ${
        favorited
          ? 'text-amber-500 hover:text-amber-600'
          : 'text-[var(--ink-300)] hover:bg-[var(--ink-50)] hover:text-amber-500'
      }`}
    >
      <Star className="h-5 w-5" strokeWidth={2.25} fill={favorited ? 'currentColor' : 'none'} />
    </button>
  );
}
