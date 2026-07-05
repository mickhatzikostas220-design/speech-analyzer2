// Shared types for Content Ideas — the tool that turns a speaker's expertise and
// brand voice into a batch of blog / video / short titles that (a) answer things
// people actually search for and (b) sound like the speaker. Imported by both the
// page (UI) and the API route so the shape can't drift between the two.

/** The kinds of content a title can be for. Drives the filter chips + tags. */
export const CONTENT_FORMATS = [
  { id: 'blog', label: 'Blog post' },
  { id: 'video', label: 'Video' },
  { id: 'short', label: 'Short / Reel' },
] as const;

export type ContentFormatId = (typeof CONTENT_FORMATS)[number]['id'];

const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  CONTENT_FORMATS.map((f) => [f.id, f.label])
);

export function isContentFormat(id: unknown): id is ContentFormatId {
  return typeof id === 'string' && id in FORMAT_LABELS;
}

export function contentFormatLabel(id: string): string {
  return FORMAT_LABELS[id] ?? 'Blog post';
}

/** One generated content idea. */
export interface ContentIdea {
  /** The title — searchable AND in the speaker's brand voice. */
  title: string;
  /** Which medium it suits best. */
  format: ContentFormatId;
  /** The search intent: the real question/need this answers and why it gets searched. */
  angle: string;
  /** The core search phrase someone would type to find it. */
  keyword: string;
}

/** The full report returned by the Content Ideas API. */
export interface ContentIdeaReport {
  /** One or two sentences on the strategy behind the batch. */
  summary: string;
  ideas: ContentIdea[];
}
