// Client-side media compression with ffmpeg.wasm.
//
// Supabase Storage on the Free plan caps uploads at 50 MB. Rather than store
// raw multi-hundred-MB recordings, we transcode in the browser before upload:
// downscale video to <=720p with a size-targeted bitrate, or re-encode audio
// to a modest MP3. This keeps everything on the Free tier without a server.
//
// ffmpeg.wasm is single-threaded here (UMD core, no SharedArrayBuffer), so this
// is CPU- and memory-bound: large 1080p inputs can take minutes. We fail open —
// if compression errors, we return the original file and let the normal upload
// path surface any limit error.

import type { FFmpeg } from '@ffmpeg/ffmpeg';

const FFMPEG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

// Stay safely under the 50 MB ceiling. Files already under this are left as-is.
export const COMPRESS_TARGET_BYTES = 45 * 1024 * 1024;

// Load a standalone ffmpeg.wasm instance (for callers that don't already have one).
export async function createFFmpeg(): Promise<FFmpeg> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  return ffmpeg;
}

interface MediaInfo {
  duration: number;
  height: number; // 0 for audio / unknown
}

// Read a media file's duration (seconds) and pixel height via a throwaway element.
function getMediaInfo(file: File): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('audio/')) {
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve({ duration: isFinite(el.duration) ? el.duration : 0, height: 0 }); };
      el.onerror = () => { URL.revokeObjectURL(url); resolve({ duration: 0, height: 0 }); };
      el.src = url;
      return;
    }
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: isFinite(el.duration) ? el.duration : 0, height: el.videoHeight || 0 });
    };
    el.onerror = () => { URL.revokeObjectURL(url); resolve({ duration: 0, height: 0 }); };
    el.src = url;
  });
}

export interface CompressOptions {
  targetBytes?: number;
  maxHeight?: number;
  onProgress?: (ratio: number) => void; // 0..1
}

// Compress a media File if it exceeds the target size. Returns the original
// File when already small enough, when compression yields no gain, or on error.
export async function maybeCompressMedia(
  ffmpeg: FFmpeg,
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const target = opts.targetBytes ?? COMPRESS_TARGET_BYTES;
  const maxHeight = opts.maxHeight ?? 720;
  if (file.size <= target) return file;

  const isAudio = file.type.startsWith('audio/');
  const { duration, height } = await getMediaInfo(file);
  const { fetchFile } = await import('@ffmpeg/util');

  const rand = Math.random().toString(36).slice(2, 8);
  const ext = (file.name.split('.').pop() || (isAudio ? 'mp3' : 'mp4')).toLowerCase();
  const inName = `cmp_in_${rand}.${ext}`;
  const outName = `cmp_out_${rand}.${isAudio ? 'mp3' : 'mp4'}`;
  const outType = isAudio ? 'audio/mpeg' : 'video/mp4';

  const onProgress = opts.onProgress;
  const handler = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)));
  };

  try {
    await ffmpeg.writeFile(inName, await fetchFile(file));
    if (onProgress) ffmpeg.on('progress', handler);

    if (isAudio) {
      const audioKbps = duration > 0
        ? Math.max(48, Math.min(160, Math.floor((target * 8) / duration / 1000)))
        : 128;
      await ffmpeg.exec(['-i', inName, '-vn', '-c:a', 'libmp3lame', '-b:a', `${audioKbps}k`, outName]);
    } else {
      const audioKbps = 128;
      // Budget the video bitrate from the size target (with ~4% mux headroom),
      // falling back to a sane default when duration is unknown.
      let videoKbps = 1200;
      if (duration > 0) {
        const totalKbps = ((target * 8) / duration / 1000) * 0.96;
        videoKbps = Math.max(300, Math.floor(totalKbps - audioKbps));
      }
      // Only downscale when the source is taller than our cap (never upscale).
      // scale=-2:H keeps the aspect ratio and forces even dimensions.
      const scaleArgs = height > maxHeight ? ['-vf', `scale=-2:${maxHeight}`] : [];
      await ffmpeg.exec([
        '-i', inName,
        ...scaleArgs,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${Math.floor(videoKbps * 1.45)}k`,
        '-bufsize', `${videoKbps * 2}k`,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`,
        '-movflags', '+faststart',
        outName,
      ]);
    }

    const out = await ffmpeg.readFile(outName);
    const data = out instanceof Uint8Array ? out : new TextEncoder().encode(out as string);
    if (data.byteLength === 0 || data.byteLength >= file.size) return file; // no gain

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const newName = `${baseName}.${isAudio ? 'mp3' : 'mp4'}`;
    // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart.
    return new File([new Uint8Array(data)], newName, { type: outType });
  } catch (err) {
    console.warn('Compression failed, uploading original:', err);
    return file;
  } finally {
    if (onProgress) ffmpeg.off('progress', handler);
    try { await ffmpeg.deleteFile(inName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outName); } catch { /* ignore */ }
  }
}
