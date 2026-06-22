// AEO Coach — shared types.

export type Plan = 'free' | 'pro';
export type Cadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type TipStatus = 'active' | 'completed' | 'skipped';
export type Track = 'wix' | 'other' | 'code';

// A single ordered instruction within a track.
export interface Step {
  title: string;
  detail: string;
}

// A catalog entry — the static, curated content for one AEO tip.
export interface AeoTipContent {
  key: string;
  title: string;
  summary: string; // one-line what & why
  why: string; // why it matters for answer-engine visibility
  effort: 'quick' | 'medium' | 'project';
  // Step-by-step instructions for each implementation path.
  tracks: Record<Track, Step[]>;
}

// A tip that has been released to a user (catalog content + their progress).
export interface UserTip {
  id: string;
  tip_key: string;
  status: TipStatus;
  track: Track | null;
  released_at: string;
  completed_at: string | null;
  content: AeoTipContent;
}

export interface AeoState {
  plan: Plan;
  cadence: Cadence;
  tips: UserTip[];
  // Whether the user can pull a new tip right now.
  canRelease: boolean;
  // When the next tip unlocks for free users (ISO), or null if available now / pro.
  nextAvailableAt: string | null;
  // No catalog tips left to release.
  exhausted: boolean;
  totalCatalog: number;
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: 'Every day',
  weekly: 'Once a week',
  biweekly: 'Every two weeks',
  monthly: 'Once a month',
};

export const TRACK_LABELS: Record<Track, string> = {
  wix: 'Wix',
  other: 'Another website builder',
  code: 'Straight code',
};
