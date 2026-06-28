import Link from 'next/link';
import {
  Mic,
  PenLine,
  Clapperboard,
  GitCompareArrows,
  Library,
  Sparkles,
  Bot,
  Inbox,
  Lightbulb,
  Search,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';

interface Tool {
  icon: LucideIcon;
  name: string;
  desc: string;
  href: string;
  bg: string;
  fg: string;
  count?: string;
}

/** Only tools that map to real, working features today. */
export function ToolGrid({ analysisCount, bookingCount = 0 }: { analysisCount: number; bookingCount?: number }) {
  const tools: Tool[] = [
    {
      icon: Mic,
      name: 'Speech Analyzer',
      desc: 'Upload a talk and see exactly where the room leaned in — or checked out.',
      href: '/analyze',
      bg: 'var(--signature)',
      fg: 'var(--on-signature)',
      count: analysisCount > 0 ? `${analysisCount} ${analysisCount === 1 ? 'analysis' : 'analyses'}` : undefined,
    },
    {
      icon: Bot,
      name: 'Assistant',
      desc: 'Your personal AI agent — knows your talks, drafts your emails, and connects your apps.',
      href: '/agent',
      bg: 'var(--accent-2)',
      fg: '#fff',
    },
    {
      icon: Inbox,
      name: 'Booking Inbox',
      desc: 'Track speaking requests from first hello to a confirmed gig on your calendar.',
      href: '/bookings',
      bg: 'var(--success)',
      fg: '#fff',
      count: bookingCount > 0 ? `${bookingCount} new` : undefined,
    },
    {
      icon: PenLine,
      name: 'Script Studio',
      desc: 'Draft, sharpen, and rehearse your keynote with help that sounds like you.',
      href: '/editor/script',
      bg: 'var(--red)',
      fg: '#fff',
    },
    {
      icon: Clapperboard,
      name: 'Talk Editor',
      desc: 'Cut highlight reels and shareable clips straight from your recorded talks.',
      href: '/editor',
      bg: 'var(--blue)',
      fg: '#fff',
    },
    {
      icon: GitCompareArrows,
      name: 'Compare',
      desc: 'Put two talks side by side and see what actually moved the room.',
      href: '/compare',
      bg: 'var(--ink-900)',
      fg: 'var(--signature)',
    },
    {
      icon: Library,
      name: 'Talk Library',
      desc: 'Every talk you’ve analyzed — organized and ready to revisit.',
      href: '/history',
      bg: 'var(--pink-200)',
      fg: 'var(--ink-900)',
      count: analysisCount > 0 ? `${analysisCount} ${analysisCount === 1 ? 'talk' : 'talks'}` : undefined,
    },
    {
      icon: Search,
      name: 'SEO & AEO',
      desc: 'Drop in your website and get tips to rank on Google and get cited by AI answer engines.',
      href: '/seo',
      bg: 'var(--accent-2)',
      fg: '#fff',
    },
    {
      icon: Lightbulb,
      name: 'Coaching Tips',
      desc: 'A fresh tip every week — schedule the ones you want to work on and check them off.',
      href: '/tips',
      bg: 'var(--yellow-400)',
      fg: 'var(--ink-900)',
    },
    {
      icon: Sparkles,
      name: 'Brand Kit',
      desc: 'Your colors, logo, fonts, and voice — keep the hub unmistakably you.',
      href: '/settings',
      bg: 'var(--ink-100)',
      fg: 'var(--ink-900)',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <Link
          key={t.name}
          href={t.href}
          className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-strong hover:shadow-soft"
        >
          <ArrowUpRight className="absolute right-5 top-5 h-5 w-5 text-[var(--ink-300)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ink-900)]" />
          <span
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
            style={{ background: t.bg, color: t.fg }}
          >
            <t.icon className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <h3 className="text-lg font-extrabold text-strong">{t.name}</h3>
          <p className="mt-1 text-sm text-muted">{t.desc}</p>
          {t.count && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              {t.count}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
