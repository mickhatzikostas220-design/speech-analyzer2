import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { CaptionStyle, TranscriptCue } from './types';

// Video rendering: downloads only the needed section of a YouTube video with
// yt-dlp, reframes it to vertical 9:16 with FFmpeg, and burns in captions.
// Mirrors the exec(ffmpeg ...) approach already used by lib/editor/ffmpeg.ts.
//
// Downloading only [start,end] (never the full file) is what lets ClipFlow
// handle 1-hour+ source videos without timing out or filling disk.

const execAsync = promisify(exec);

export class ClipperUnavailableError extends Error {}

let toolsChecked: { ffmpeg: boolean; ytdlp: boolean } | null = null;

/** Returns which CLI tools are present. Cached after first check. */
export async function checkTools(): Promise<{ ffmpeg: boolean; ytdlp: boolean }> {
  if (toolsChecked) return toolsChecked;
  const has = async (cmd: string) => {
    try {
      await execAsync(`command -v ${cmd}`);
      return true;
    } catch {
      return false;
    }
  };
  toolsChecked = { ffmpeg: await has('ffmpeg'), ytdlp: await has('yt-dlp') };
  return toolsChecked;
}

function srtTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const s = Math.floor(seconds) % 60;
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Build an SRT for the [start,end] window, timed relative to the clip start. */
function buildSrt(cues: TranscriptCue[], start: number, end: number): string {
  const inWindow = cues
    .filter((c) => c.end > start && c.start < end)
    .map((c, i) => {
      const from = Math.max(0, c.start - start);
      const to = Math.min(end - start, c.end - start);
      return `${i + 1}\n${srtTime(from)} --> ${srtTime(to)}\n${c.text}\n`;
    });
  return inWindow.join('\n');
}

const CAPTION_STYLES: Record<CaptionStyle, string> = {
  // ASS force_style strings — bottom-centered, high-contrast for mobile.
  opus: 'FontName=Arial,Fontsize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=120',
  karaoke: 'FontName=Arial,Fontsize=18,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=120',
  minimal: 'FontName=Arial,Fontsize=14,Bold=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=80',
};

export interface RenderOptions {
  youtubeId: string;
  start: number;
  end: number;
  cues?: TranscriptCue[] | null;
  captionStyle?: CaptionStyle;
  burnCaptions?: boolean;
}

export interface RenderResult {
  videoFile: string;
  thumbFile: string;
  workDir: string;
}

/**
 * Render a single vertical 9:16 clip. Returns local temp file paths; the caller
 * is responsible for uploading them and cleaning up the work dir via cleanup().
 */
export async function renderClip(opts: RenderOptions): Promise<RenderResult> {
  const tools = await checkTools();
  if (!tools.ytdlp || !tools.ffmpeg) {
    const missing = [
      !tools.ytdlp ? 'yt-dlp' : null,
      !tools.ffmpeg ? 'ffmpeg' : null,
    ].filter(Boolean).join(' and ');
    throw new ClipperUnavailableError(
      `Rendering requires ${missing} on the server. The clip plan, captions, and copy are ready — install the tools (or run the worker on a machine that has them) to export the video file.`
    );
  }

  const workDir = join(tmpdir(), `clipflow-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const pad = 0.25; // small lead-in so we don't clip the first word
  const start = Math.max(0, opts.start - pad);
  const end = opts.end + pad;
  const sourceFile = join(workDir, 'source.mp4');
  const videoFile = join(workDir, 'clip.mp4');
  const thumbFile = join(workDir, 'thumb.jpg');

  // 1) Download only the needed section.
  await execAsync(
    `yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b" ` +
      `--download-sections "*${start.toFixed(2)}-${end.toFixed(2)}" ` +
      `--force-keyframes-at-cuts -o "${sourceFile}" ` +
      `"https://www.youtube.com/watch?v=${opts.youtubeId}"`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }
  );

  // 2) Build the video filter: center-crop to 9:16 then scale to 1080x1920.
  const filters = ['crop=ih*9/16:ih', 'scale=1080:1920'];

  if (opts.burnCaptions !== false && opts.cues && opts.cues.length) {
    const srt = buildSrt(opts.cues, opts.start, opts.end);
    if (srt.trim()) {
      const srtFile = join(workDir, 'captions.srt');
      await writeFile(srtFile, srt, 'utf-8');
      const style = CAPTION_STYLES[opts.captionStyle ?? 'opus'];
      // Escape the path for the subtitles filter.
      const escaped = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      filters.push(`subtitles='${escaped}':force_style='${style}'`);
    }
  }

  // 3) Re-encode to the final clip.
  await execAsync(
    `ffmpeg -y -i "${sourceFile}" -vf "${filters.join(',')}" ` +
      `-c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k ` +
      `-movflags +faststart "${videoFile}"`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 300_000 }
  );

  // 4) Grab a thumbnail from the middle of the clip.
  const mid = Math.max(0, (opts.end - opts.start) / 2);
  await execAsync(
    `ffmpeg -y -ss ${mid.toFixed(2)} -i "${videoFile}" -frames:v 1 -q:v 3 "${thumbFile}"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }
  );

  return { videoFile, thumbFile, workDir };
}

export async function cleanup(workDir: string): Promise<void> {
  if (workDir && existsSync(workDir)) {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
