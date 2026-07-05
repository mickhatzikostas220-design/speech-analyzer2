// Shared types and input options for Stage Finder — the tool that takes the
// speakers a user admires, finds similar speakers, surfaces the kinds of events
// those speakers appear at, and compiles a pitch pack so the user can approach
// those events themselves. Imported by both the page (UI) and the API route so
// the shape can't drift between the two.

/** Speaking formats the user can target. Shapes which events we surface. */
export const SPEAKING_FORMATS = [
  { id: 'any', label: 'Any format' },
  { id: 'keynote', label: 'Keynote stages' },
  { id: 'panel', label: 'Panels & fireside chats' },
  { id: 'workshop', label: 'Workshops & breakouts' },
  { id: 'podcast', label: 'Podcasts & shows' },
  { id: 'corporate', label: 'Corporate & internal events' },
] as const;

export type SpeakingFormatId = (typeof SPEAKING_FORMATS)[number]['id'];

const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  SPEAKING_FORMATS.map((f) => [f.id, f.label])
);

export function isSpeakingFormat(id: unknown): id is SpeakingFormatId {
  return typeof id === 'string' && id in FORMAT_LABELS;
}

export function speakingFormatLabel(id: string): string {
  return FORMAT_LABELS[id] ?? 'Any format';
}

/** A single real event / stage where an admired speaker has publicly appeared. */
export interface SpeakerAppearanceEvent {
  /** Event, conference, series, show, or platform name. */
  name: string;
  /** e.g. "Annual conference", "Podcast", "Corporate keynote". */
  format: string;
  /** Short context — talk title, role, or year if known. May be empty. */
  note: string;
  /**
   * Timing: when they appeared and, when known, when the event next runs —
   * e.g. "Spoke Oct 2024 · Next edition Sept 2025". Lets the user gauge the
   * event's cadence and the window to pitch. May be empty.
   */
  when: string;
  /**
   * Web source backing this appearance — ideally the event's OWN site or the
   * announcement page, not a speaker-bureau profile. May be empty.
   */
  sourceUrl: string;
}

/**
 * The real speaking footprint of one speaker the user admires: the actual
 * events that speaker appears at, as opposed to the events we recommend the
 * user pitch (see StageEvent). Surfaced so the user can see where their idols
 * genuinely take the stage.
 */
export interface SpeakerAppearance {
  /** The admired speaker (one of the names the user entered). */
  speaker: string;
  /** Notable, real events / stages this speaker has genuinely appeared at. */
  events: SpeakerAppearanceEvent[];
}

/** A speaker similar to the ones the user admires. */
export interface SimilarSpeaker {
  name: string;
  /** One line: what they're best known for. */
  knownFor: string;
  /** Why they resemble the admired set (and, where given, the user's topic). */
  whySimilar: string;
  /** Real events this peer has spoken at (web-searched where possible). */
  events: SpeakerAppearanceEvent[];
}

/** An event / series the user could realistically pitch themselves to. */
export interface StageEvent {
  /** Event, conference, series, or show name. */
  name: string;
  /** e.g. "Annual conference", "Corporate summit", "Weekly podcast". */
  format: string;
  /** Who attends / listens. */
  audience: string;
  /** Why this event is a fit for the user specifically. */
  whyFit: string;
  /** Admired or similar speakers associated with this event's world. */
  speakersSeen: string[];
  /** A tailored talk/topic angle the user could pitch to this event. */
  pitchAngle: string;
  /** Practical guidance: where to find the CFP / who to contact / how to apply. */
  howToApproach: string;
  /** Web source backing this event — its site, CFP, or a listing. May be empty. */
  sourceUrl: string;
}

/** A ready-to-adapt outreach email the user can send to an organizer. */
export interface OutreachTemplate {
  subject: string;
  body: string;
}

/** The full report returned by the Stage Finder API. */
export interface StageReport {
  /** One or two sentence overall read on where this speaker fits. */
  summary: string;
  /** Where each admired speaker actually appears — their real footprint. */
  speakerAppearances: SpeakerAppearance[];
  similarSpeakers: SimilarSpeaker[];
  events: StageEvent[];
  outreach: OutreachTemplate | null;
}
