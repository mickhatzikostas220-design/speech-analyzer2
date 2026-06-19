// Shared types for ClipFlow — long-form → short-form clipping & publishing.

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';

export const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'twitter'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube Shorts',
  twitter: 'X (Twitter)',
};

export type ProjectStatus =
  | 'queued'
  | 'fetching'
  | 'transcribing'
  | 'analyzing'
  | 'clipping'
  | 'ready'
  | 'error';

export type ClipStatus = 'draft' | 'rendering' | 'ready' | 'error';

export type PostStatus = 'queued' | 'scheduled' | 'posting' | 'posted' | 'failed';

export type CaptionStyle = 'opus' | 'karaoke' | 'minimal';

export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

export interface PlatformHashtags {
  default?: string[];
  instagram?: string[];
  tiktok?: string[];
  youtube?: string[];
  twitter?: string[];
}

export interface ClipFlowProject {
  id: string;
  user_id: string;
  source_url: string;
  source_type: 'video' | 'channel';
  youtube_id: string | null;
  title: string | null;
  description: string | null;
  channel_title: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  transcript: TranscriptCue[] | null;
  status: ProjectStatus;
  progress: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipFlowClip {
  id: string;
  project_id: string;
  user_id: string;
  position: number;
  start_seconds: number;
  end_seconds: number;
  title: string | null;
  caption: string | null;
  description: string | null;
  hashtags: PlatformHashtags;
  transcript_text: string | null;
  score: number | null;
  reason: string | null;
  caption_style: CaptionStyle;
  file_path: string | null;
  thumbnail_url: string | null;
  status: ClipStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipFlowConnection {
  platform: Platform;
  account_name: string | null;
  scopes: string | null;
  token_expires_at: string | null;
  connected: boolean;
}

export interface ClipFlowPost {
  id: string;
  clip_id: string;
  user_id: string;
  platform: Platform;
  status: PostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  external_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// A candidate clip proposed by the moment-detection model, before persistence.
export interface ClipCandidate {
  start: number;
  end: number;
  title: string;
  caption: string;
  description: string;
  hashtags: PlatformHashtags;
  transcript_text: string;
  score: number;
  reason: string;
}
