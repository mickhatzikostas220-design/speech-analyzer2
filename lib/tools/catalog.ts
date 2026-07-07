// Single source of truth for the hub's tools.
//
// Both the dashboard ToolGrid (where a speaker favorites a tool) and the
// Navbar (where favorited tools appear pinned in the top bar) read from this
// list, so the two never drift apart. Only static metadata lives here —
// dynamic bits like per-tool counts are layered on where they're rendered.
//
// `key` is the stable id we persist in profiles.favorite_tools. Never rename a
// key once shipped, or existing favorites pointing at it will be dropped.

import type { LucideIcon } from 'lucide-react';
import {
  Mic,
  PenLine,
  Clapperboard,
  Scissors,
  GitCompareArrows,
  GitBranch,
  Library,
  Sparkles,
  Bot,
  Inbox,
  Lightbulb,
  Search,
  Telescope,
  Newspaper,
} from 'lucide-react';
import type { PlanId } from '@/lib/subscription/plans';
import { isPathComingSoon } from '@/lib/tools/comingSoon';

export interface ToolMeta {
  /** Stable id persisted in favorites. Do not change once shipped. */
  key: string;
  icon: LucideIcon;
  name: string;
  desc: string;
  href: string;
  bg: string;
  fg: string;
  /** Minimum plan required to use the tool (omit for free tools). */
  tier?: PlanId;
}

export const TOOLS: ToolMeta[] = [
  {
    key: 'speech-analyzer',
    icon: Mic,
    name: 'Speech Analyzer',
    desc: 'Upload a talk and see exactly where the room leaned in — or checked out.',
    href: '/analyze',
    bg: 'var(--signature)',
    fg: 'var(--on-signature)',
  },
  {
    key: 'assistant',
    icon: Bot,
    name: 'Assistant',
    desc: 'Your personal AI agent — knows your talks, drafts your emails, and connects your apps.',
    href: '/agent',
    bg: 'var(--accent-2)',
    fg: '#fff',
    tier: 'full',
  },
  {
    key: 'booking-inbox',
    icon: Inbox,
    name: 'Booking Inbox',
    desc: 'Track speaking requests from first hello to a confirmed gig on your calendar.',
    href: '/bookings',
    bg: 'var(--success)',
    fg: '#fff',
    tier: 'core',
  },
  {
    key: 'script-studio',
    icon: PenLine,
    name: 'Script Studio',
    desc: 'Draft, sharpen, and rehearse your keynote with help that sounds like you.',
    href: '/editor/script',
    bg: 'var(--red)',
    fg: '#fff',
    tier: 'core',
  },
  {
    key: 'keynote-tailoring',
    icon: GitBranch,
    name: 'Keynote Description Tailoring',
    desc: 'Store your keynote once, then spin up industry-specific versions that keep your voice and idea.',
    href: '/keynotes',
    bg: 'var(--accent-2)',
    fg: '#fff',
    tier: 'core',
  },
  {
    key: 'stage-finder',
    icon: Telescope,
    name: 'Stage Finder',
    desc: 'Name speakers you admire and find events they’ve spoken at — plus a draft pitch to reach out.',
    href: '/stagefinder',
    bg: 'var(--red)',
    fg: '#fff',
    tier: 'core',
  },
  {
    key: 'talk-editor',
    icon: Clapperboard,
    name: 'Talk Editor',
    desc: 'Cut highlight reels and shareable clips straight from your recorded talks.',
    href: '/editor',
    bg: 'var(--blue)',
    fg: '#fff',
    tier: 'core',
  },
  {
    key: 'clipflow',
    icon: Scissors,
    name: 'ClipFlow',
    desc: 'Drop in a video or channel and auto-cut social-ready clips, then post them straight to your platforms.',
    href: '/clipflow',
    bg: 'var(--ink-900)',
    fg: 'var(--blue)',
    tier: 'full',
  },
  {
    key: 'compare',
    icon: GitCompareArrows,
    name: 'Compare',
    desc: 'Put two talks side by side and see what actually moved the room.',
    href: '/compare',
    bg: 'var(--ink-900)',
    fg: '#F34E1E',
  },
  {
    key: 'talk-library',
    icon: Library,
    name: 'Talk Library',
    desc: 'Every talk you’ve analyzed — organized and ready to revisit.',
    href: '/history',
    bg: 'var(--pink-200)',
    fg: 'var(--ink-900)',
  },
  {
    key: 'seo-aeo',
    icon: Search,
    name: 'SEO & AEO',
    desc: 'Drop in your website and get tips to rank on Google and get cited by AI answer engines.',
    href: '/seo',
    bg: 'var(--accent-2)',
    fg: '#fff',
  },
  {
    key: 'content-ideas',
    icon: Newspaper,
    name: 'Content Ideas',
    desc: 'Get 20–30 blog, video, and short titles that people actually search for — in your brand voice.',
    href: '/content-ideas',
    bg: 'var(--yellow-400)',
    fg: 'var(--ink-900)',
    tier: 'core',
  },
  {
    key: 'coaching-tips',
    icon: Lightbulb,
    name: 'Coaching Tips',
    desc: 'A fresh tip every week — schedule the ones you want to work on and check them off.',
    href: '/tips',
    bg: 'var(--yellow-400)',
    fg: 'var(--ink-900)',
  },
  {
    key: 'brand-kit',
    icon: Sparkles,
    name: 'Brand Kit',
    desc: 'Your colors, logo, fonts, and voice — keep the hub unmistakably you.',
    href: '/settings',
    bg: 'var(--ink-100)',
    fg: 'var(--ink-900)',
  },
];

/** Every valid tool key — used to validate persisted favorites. */
export const TOOL_KEYS: string[] = TOOLS.map((t) => t.key);

const TOOLS_BY_KEY = new Map(TOOLS.map((t) => [t.key, t]));

/** Look up a tool's metadata by its stable key. */
export function toolByKey(key: string): ToolMeta | undefined {
  return TOOLS_BY_KEY.get(key);
}

/** True when a tool is locked as "coming soon" (see lib/tools/comingSoon.ts,
 *  the single source of truth shared with the middleware route guard). */
export function toolIsComingSoon(tool: ToolMeta): boolean {
  return isPathComingSoon(tool.href);
}
