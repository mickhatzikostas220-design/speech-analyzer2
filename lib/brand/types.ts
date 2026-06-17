/**
 * BrandKit — everything that makes a speaker's hub theirs.
 *
 * Stored as a single `jsonb` column on `profiles.brand`. The default
 * (Hatzikostas) kit lives in ./defaults. At sign-up a speaker enters
 * their website and we auto-extract a kit (see ./extract); they can
 * adjust it later in Settings. The kit is turned into CSS variable
 * overrides by ./theme so the whole design-token system re-skins.
 */

export type BrandSource = 'default' | 'extracted' | 'custom';

export interface BrandColors {
  /** The loud signature color — buttons, highlights, hero blocks. */
  signature: string;
  /** Secondary accent — links, tags, small pops. */
  accent: string;
  /** Darkest brand ink — headings, body text, hard borders. */
  ink: string;
  /** Base surface for cards / "paper". */
  paper: string;
  /** Page background (usually a hair off paper). */
  page: string;
  /** Readable text color to sit on top of `signature`. */
  onSignature: string;
}

export type LogoType = 'wordmark' | 'image';

export interface BrandLogo {
  type: LogoType;
  /** Text drawn in the display font when type === 'wordmark'. */
  wordmarkText?: string;
  /** Full logo image (extracted or uploaded) when type === 'image'. */
  imageUrl?: string;
  /** Small square mark / favicon, used in the top bar + tab. */
  markUrl?: string;
}

export interface BrandFonts {
  /** font-family stack for headings / display. */
  display: string;
  /** font-family stack for body / UI. */
  body: string;
  /** Optional stylesheet href (e.g. Google Fonts) to load the families. */
  cssHref?: string;
}

export interface BrandVoice {
  /** Short label for the tone, e.g. "Bold, warm, second-person". */
  tone: string;
  /** A first-screen greeting line, generated from name + tone. */
  greeting?: string;
  /** Raw "about" text pulled from the site — seeds AI copy later. */
  about?: string;
}

export interface BrandHero {
  /** Headshot / stage photo (often the site's og:image). */
  imageUrl?: string;
}

export interface OneSheetTopic {
  title: string;
  description?: string;
}

export interface OneSheetTestimonial {
  quote: string;
  author?: string;
  role?: string;
}

/** Public one-sheet / media-kit content, rendered on /s/[slug]. */
export interface OneSheet {
  headline?: string;
  bio?: string;
  topics?: OneSheetTopic[];
  testimonials?: OneSheetTestimonial[];
  contactEmail?: string;
}

export interface BrandKit {
  /** Speaker / display name — drives the wordmark + greeting. */
  name: string;
  tagline?: string;
  /** Public one-sheet content (bio, topics, testimonials). */
  oneSheet?: OneSheet;
  colors: BrandColors;
  fonts: BrandFonts;
  logo: BrandLogo;
  hero: BrandHero;
  voice: BrandVoice;
  source: BrandSource;
  /** The website the kit was extracted from, if any. */
  sourceUrl?: string;
  extractedAt?: string;
}
