'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { preloadVideo } from '@remotion/preload';
import { TimelineComposition } from '@/components/editor/TimelineComposition';
import type { CompositionSegment, CompositionCaption } from '@/components/editor/TimelineComposition';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RemotionPlayer = dynamic<any>(
  () => import('@remotion/player').then((m) => m.Player),
  { ssr: false, loading: () => <div className="w-full h-full bg-black" /> }
);

const FPS = 30;
const TRACK_LABEL_WIDTH = 112;
const RULER_HEIGHT = 28;
const VIDEO_TRACK_HEIGHT = 64;
const MIN_ZOOM = 20; // px per second at min
const MAX_ZOOM = 400;
const DEFAULT_ZOOM = 80;

// ── Types ────────────────────────────────────────────────────
interface WordTimestamp { word: string; start: number; end: number; }

interface TLClip {
  clipId: string;
  clipName: string;
  clipPath: string;
  start: number;
  end: number;
  transcription: WordTimestamp[];
  videoUrl?: string | null;
}

interface TLSegment {
  id: string;
  scriptLine: string;
  clips: TLClip[];
  trimStart: number;
  trimEnd: number;
  title: string;
  volume: number;
}

interface TLCaption {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface TLProject {
  id: string;
  title: string;
  status: string;
  segments: TLSegment[];
  captions: TLCaption[];
  created_at: string;
}

interface TrimPreview {
  start: string | null;
  end: string | null;
}

// ── Helpers ──────────────────────────────────────────────────
async function safeJson(res: Response) {
  try { const t = (await res.text()).trim(); return t ? JSON.parse(t) : {}; }
  catch { return { error: `Server error ${res.status}` }; }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function fmtRulerTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

function escapeDrawtext(t: string) {
  return t
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/:/g, '\\:').replace(/%/g, '\\%')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function generateCaptionsFromSegments(segments: TLSegment[]): TLCaption[] {
  const caps: TLCaption[] = [];
  let abs = 0;
  for (const seg of segments) {
    const lastIdx = seg.clips.length - 1;
    for (let ci = 0; ci < seg.clips.length; ci++) {
      const clip = seg.clips[ci];
      const effStart = clip.start + (ci === 0 ? seg.trimStart : 0);
      const effEnd = clip.end - (ci === lastIdx ? seg.trimEnd : 0);
      if (effEnd <= effStart) continue;
      const words = (clip.transcription ?? []).filter(w => w.start >= effStart - 0.1 && w.end <= effEnd + 0.1);
      let chunk: WordTimestamp[] = [];
      for (const w of words) {
        chunk.push(w);
        if (chunk.length >= 6 || w.end - chunk[0].start >= 4) {
          caps.push({ id: crypto.randomUUID(), text: chunk.map(x => x.word).join(' ').trim(), start: Math.max(0, abs + chunk[0].start - effStart), end: abs + chunk[chunk.length - 1].end - effStart });
          chunk = [];
        }
      }
      if (chunk.length) caps.push({ id: crypto.randomUUID(), text: chunk.map(x => x.word).join(' ').trim(), start: Math.max(0, abs + chunk[0].start - effStart), end: abs + chunk[chunk.length - 1].end - effStart });
      abs += effEnd - effStart;
    }
  }
  return caps;
}

function segEffectiveDuration(seg: TLSegment) {
  const lastIdx = seg.clips.length - 1;
  return seg.clips.reduce((s, c, ci) => {
    const effStart = c.start + (ci === 0 ? seg.trimStart : 0);
    const effEnd = c.end - (ci === lastIdx ? seg.trimEnd : 0);
    return s + Math.max(0, effEnd - effStart);
  }, 0);
}

function computeAutoTrim(seg: TLSegment): { trimStart: number; trimEnd: number } {
  const BUFFER = 0.15;
  if (!seg.clips.length) return { trimStart: seg.trimStart, trimEnd: seg.trimEnd };
  const firstClip = seg.clips[0];
  const lastClip = seg.clips[seg.clips.length - 1];
  const firstWords = (firstClip.transcription ?? [])
    .filter(w => w.start >= firstClip.start - 0.05 && w.end <= firstClip.end + 0.05)
    .sort((a, b) => a.start - b.start);
  const lastWords = (lastClip.transcription ?? [])
    .filter(w => w.start >= lastClip.start - 0.05 && w.end <= lastClip.end + 0.05)
    .sort((a, b) => a.start - b.start);
  const trimStart = firstWords.length > 0
    ? Math.max(0, firstWords[0].start - firstClip.start - BUFFER) : seg.trimStart;
  const trimEnd = lastWords.length > 0
    ? Math.max(0, lastClip.end - lastWords[lastWords.length - 1].end - BUFFER) : seg.trimEnd;
  return {
    trimStart: Math.round(trimStart * 100) / 100,
    trimEnd: Math.round(trimEnd * 100) / 100,
  };
}

function buildCompositionProps(segments: TLSegment[], captions: TLCaption[]): {
  compSegments: CompositionSegment[];
  compCaptions: CompositionCaption[];
  totalFrames: number;
} {
  let absFrame = 0;
  const compSegments: CompositionSegment[] = [];
  for (const seg of segments) {
    const lastIdx = seg.clips.length - 1;
    const clips = seg.clips
      .map((clip, ci) => {
        const effStart = clip.start + (ci === 0 ? seg.trimStart : 0);
        const effEnd = clip.end - (ci === lastIdx ? seg.trimEnd : 0);
        if (effEnd <= effStart || !clip.videoUrl) return null;
        const startFrame = Math.round(effStart * FPS);
        const durationFrames = Math.round(effEnd * FPS) - startFrame;
        if (durationFrames <= 0) return null;
        return { videoUrl: clip.videoUrl, startFrame, durationFrames };
      })
      .filter(Boolean) as { videoUrl: string; startFrame: number; durationFrames: number }[];
    const segDur = clips.reduce((s, c) => s + c.durationFrames, 0);
    if (clips.length > 0) {
      compSegments.push({ clips, title: seg.title, volume: seg.volume, startFrame: absFrame });
      absFrame += segDur;
    }
  }
  return {
    compSegments,
    compCaptions: captions.map(cap => ({
      text: cap.text,
      startFrame: Math.round(cap.start * FPS),
      endFrame: Math.round(cap.end * FPS),
    })),
    totalFrames: absFrame,
  };
}

// ── Segment start times ──────────────────────────────────────
function buildSegmentOffsets(segments: TLSegment[]): number[] {
  const offsets: number[] = [];
  let t = 0;
  for (const seg of segments) {
    offsets.push(t);
    t += segEffectiveDuration(seg);
  }
  return offsets;
}

// ── Page ─────────────────────────────────────────────────────
export default function TimelineEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);
  const frameCacheRef = useRef<Map<string, string | null>>(new Map());
  const trimDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const playheadDragRef = useRef<{ dragging: boolean; startX: number; startTime: number }>({ dragging: false, startX: 0, startTime: 0 });

  const [project, setProject] = useState<TLProject | null>(null);
  const [segments, setSegments] = useState<TLSegment[]>([]);
  const [captions, setCaptions] = useState<TLCaption[]>([]);
  const [loading, setLoading] = useState(true);
  const [trimPreviews, setTrimPreviews] = useState<Record<string, TrimPreview>>({});
  const [generatingCaps, setGeneratingCaps] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'segment' | 'captions'>('segment');
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM); // px per second
  const [playheadTime, setPlayheadTime] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/editor/timeline/${params.id}`)
      .then(safeJson)
      .then(d => {
        if (d.error) { router.push('/editor'); return; }
        const p = d as TLProject;
        const segs = (p.segments ?? []).map(s => ({
          ...s,
          trimStart: s.trimStart ?? 0,
          trimEnd:   s.trimEnd   ?? 0,
          title:     s.title     ?? '',
          volume:    s.volume    ?? 1,
        }));
        setProject(p);
        setSegments(segs);
        setCaptions(p.captions ?? []);
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);

  useEffect(() => {
    if (!loading && segments.length > 0) {
      segments.forEach(seg => loadTrimPreviews(seg));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const urls = new Set<string>();
    segments.forEach(seg => seg.clips.forEach(clip => { if (clip.videoUrl) urls.add(clip.videoUrl); }));
    const freeList = Array.from(urls).map(url => preloadVideo(url));
    return () => freeList.forEach(free => free());
  }, [segments]);

  // ── Composition props ────────────────────────────────────────
  const { compSegments, compCaptions, totalFrames } = useMemo(
    () => buildCompositionProps(segments, captions),
    [segments, captions]
  );

  const segmentOffsets = useMemo(() => buildSegmentOffsets(segments), [segments]);
  const totalSeconds = totalFrames / FPS;

  // ── Frame capture ────────────────────────────────────────────
  async function captureFrame(url: string, timeSeconds: number): Promise<string | null> {
    const key = `${url.slice(-50)}-${timeSeconds.toFixed(2)}`;
    if (frameCacheRef.current.has(key)) return frameCacheRef.current.get(key) ?? null;
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      let done = false;
      const finish = (result: string | null) => {
        if (done) return;
        done = true;
        frameCacheRef.current.set(key, result);
        resolve(result);
      };
      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320; canvas.height = 180;
          canvas.getContext('2d')!.drawImage(video, 0, 0, 320, 180);
          finish(canvas.toDataURL('image/jpeg', 0.75));
        } catch { finish(null); }
      }, { once: true });
      video.addEventListener('error', () => finish(null), { once: true });
      video.src = url;
      video.currentTime = Math.max(0, timeSeconds);
    });
  }

  async function loadTrimPreviews(seg: TLSegment) {
    if (!seg.clips.length) return;
    const firstClip = seg.clips[0];
    const lastClip  = seg.clips[seg.clips.length - 1];
    const startUrl  = firstClip.videoUrl;
    const endUrl    = lastClip.videoUrl;
    if (!startUrl || !endUrl) return;
    const [startFrame, endFrame] = await Promise.all([
      captureFrame(startUrl, Math.max(0, firstClip.start + seg.trimStart)),
      captureFrame(endUrl,   Math.max(0, lastClip.end   - seg.trimEnd)),
    ]);
    setTrimPreviews(prev => ({ ...prev, [seg.id]: { start: startFrame, end: endFrame } }));
  }

  // ── Persist ──────────────────────────────────────────────────
  async function persist(segs: TLSegment[], caps: TLCaption[]) {
    const cleanSegs = segs.map(s => ({
      ...s,
      clips: s.clips.map(({ videoUrl: _, ...clip }) => clip),
    }));
    await fetch(`/api/editor/timeline/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments: cleanSegs, captions: caps }),
    });
  }

  async function getFreshUrlMap(): Promise<Map<string, string>> {
    const d = await safeJson(await fetch(`/api/editor/timeline/${params.id}`));
    const map = new Map<string, string>();
    for (const seg of d.segments ?? []) {
      for (const clip of seg.clips ?? []) {
        if (clip.clipPath && clip.videoUrl) map.set(clip.clipPath, clip.videoUrl);
      }
    }
    return map;
  }

  async function getFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ff = new FFmpeg();
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ff;
    return ff;
  }

  // ── Segment ops ──────────────────────────────────────────────
  function moveSegment(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[i], next[j]] = [next[j], next[i]];
    setSegments(next);
    setSelectedIdx(j);
    persist(next, captions);
  }

  function removeSegment(i: number) {
    const next = segments.filter((_, idx) => idx !== i);
    setSegments(next);
    setSelectedIdx(null);
    persist(next, captions);
  }

  function patchSegment(i: number, patch: Partial<TLSegment>) {
    setSegments(prev => {
      const next = prev.map((s, idx) => idx === i ? { ...s, ...patch } : s);
      const seg = next[i];
      if ('trimStart' in patch || 'trimEnd' in patch) {
        if (trimDebounceRef.current[seg.id]) clearTimeout(trimDebounceRef.current[seg.id]);
        trimDebounceRef.current[seg.id] = setTimeout(() => loadTrimPreviews(seg), 300);
      }
      return next;
    });
  }

  function handleAutoTrimSegment(i: number) {
    const seg = segments[i];
    const { trimStart, trimEnd } = computeAutoTrim(seg);
    const next = segments.map((s, idx) => idx === i ? { ...s, trimStart, trimEnd } : s);
    setSegments(next);
    persist(next, captions);
    loadTrimPreviews({ ...seg, trimStart, trimEnd });
  }

  function handleAutoTrimAll() {
    const next = segments.map(seg => {
      const { trimStart, trimEnd } = computeAutoTrim(seg);
      return { ...seg, trimStart, trimEnd };
    });
    setSegments(next);
    persist(next, captions);
    next.forEach(seg => loadTrimPreviews(seg));
  }

  function handleSelectSegment(i: number) {
    setSelectedIdx(i);
    setRightTab('segment');
    loadTrimPreviews(segments[i]);
    const t = segmentOffsets[i] ?? 0;
    setPlayheadTime(t);
    if (playerRef.current && compSegments[i] !== undefined) {
      playerRef.current.seekTo(compSegments[i].startFrame);
    }
  }

  // ── Caption ops ──────────────────────────────────────────────
  function handleGenerateCaptions() {
    setGeneratingCaps(true);
    const caps = generateCaptionsFromSegments(segments);
    setCaptions(caps);
    persist(segments, caps).finally(() => setGeneratingCaps(false));
  }

  function patchCaption(id: string, text: string) {
    setCaptions(prev => prev.map(c => c.id === id ? { ...c, text } : c));
  }

  function saveCaption() { persist(segments, captions); }

  function removeCaption(id: string) {
    const next = captions.filter(c => c.id !== id);
    setCaptions(next);
    persist(segments, next);
  }

  // ── Export ───────────────────────────────────────────────────
  async function handleExport() {
    const validSegs = segments.filter(s => s.clips.some(c => c.end - s.trimEnd > c.start + s.trimStart));
    if (!validSegs.length) return;
    setExporting(true);
    setExportProgress(0);
    setError(null);
    try {
      const ff = await getFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');
      const urlMap = await getFreshUrlMap();
      const progressHandler = ({ progress }: { progress: number }) =>
        setExportProgress(Math.round(Math.min(progress, 1) * 100));
      ff.on('progress', progressHandler);
      const uniquePaths = Array.from(new Set(validSegs.flatMap(s => s.clips.map(c => c.clipPath))));
      for (const path of uniquePaths) {
        const url = urlMap.get(path);
        if (!url) throw new Error(`No signed URL for ${path}`);
        await ff.writeFile(`src_${btoa(path).replace(/[+/=]/g, '_')}.mp4`, await fetchFile(url));
      }
      let pieceIdx = 0;
      for (const seg of validSegs) {
        const lastClipIdx = seg.clips.length - 1;
        for (let ci = 0; ci < seg.clips.length; ci++) {
          const clip = seg.clips[ci];
          const effStart = clip.start + (ci === 0 ? seg.trimStart : 0);
          const effEnd   = clip.end   - (ci === lastClipIdx ? seg.trimEnd : 0);
          if (effEnd <= effStart) continue;
          const srcName = `src_${btoa(clip.clipPath).replace(/[+/=]/g, '_')}.mp4`;
          await ff.exec([
            '-i', srcName, '-ss', String(effStart), '-to', String(effEnd),
            '-af', `volume=${seg.volume}`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            `piece_${pieceIdx}.mp4`,
          ]);
          pieceIdx++;
        }
      }
      if (pieceIdx === 0) throw new Error('No valid segments to export');
      const concatList = Array.from({ length: pieceIdx }, (_, i) => `file 'piece_${i}.mp4'`).join('\n');
      await ff.writeFile('concat.txt', new TextEncoder().encode(concatList));
      await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'assembled.mp4']);
      let absTime = 0;
      const titleFilters: string[] = [];
      for (const seg of validSegs) {
        const dur = segEffectiveDuration(seg);
        if (seg.title.trim()) {
          titleFilters.push(
            `drawtext=text='${escapeDrawtext(seg.title)}':fontsize=36:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h*0.1:enable='between(t,${absTime.toFixed(3)},${(absTime + dur).toFixed(3)})'`
          );
        }
        absTime += dur;
      }
      const captionFilters = captions.map(cap =>
        `drawtext=text='${escapeDrawtext(cap.text)}':fontsize=28:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y=h*0.85:enable='between(t,${cap.start.toFixed(3)},${cap.end.toFixed(3)})'`
      );
      const allFilters = [...captionFilters, ...titleFilters].filter(Boolean);
      if (allFilters.length > 0) {
        await ff.exec(['-i', 'assembled.mp4', '-vf', allFilters.join(','), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'copy', 'output.mp4']);
      } else {
        await ff.exec(['-i', 'assembled.mp4', '-c', 'copy', 'output.mp4']);
      }
      ff.off('progress', progressHandler);
      const raw = await ff.readFile('output.mp4');
      const blob = new Blob([new Uint8Array(raw as ArrayBuffer)], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${(project?.title ?? 'export').replace(/[^a-z0-9]/gi, '_')}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      for (let i = 0; i < pieceIdx; i++) { try { await ff.deleteFile(`piece_${i}.mp4`); } catch { /* ignore */ } }
      try { await ff.deleteFile('assembled.mp4'); } catch { /* ignore */ }
      try { await ff.deleteFile('output.mp4'); } catch { /* ignore */ }
      try { await ff.deleteFile('concat.txt'); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }

  // ── Timeline ruler ticks ─────────────────────────────────────
  const rulerTicks = useMemo(() => {
    const totalWidth = Math.max(totalSeconds * zoomLevel + 200, 600);
    const secondsVisible = totalWidth / zoomLevel;
    let step = 1;
    if (zoomLevel < 30) step = 10;
    else if (zoomLevel < 60) step = 5;
    else if (zoomLevel < 120) step = 2;
    const ticks = [];
    for (let t = 0; t <= secondsVisible + step; t += step) {
      ticks.push(t);
    }
    return { ticks, step };
  }, [totalSeconds, zoomLevel]);

  // ── Playhead drag ────────────────────────────────────────────
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    playheadDragRef.current = { dragging: true, startX: e.clientX, startTime: playheadTime };
    const onMove = (ev: MouseEvent) => {
      if (!playheadDragRef.current.dragging) return;
      const dx = ev.clientX - playheadDragRef.current.startX;
      const dt = dx / zoomLevel;
      const newTime = Math.max(0, Math.min(totalSeconds, playheadDragRef.current.startTime + dt));
      setPlayheadTime(newTime);
      if (playerRef.current) playerRef.current.seekTo(Math.round(newTime * FPS));
    };
    const onUp = () => {
      playheadDragRef.current.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [playheadTime, zoomLevel, totalSeconds]);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const t = Math.max(0, Math.min(totalSeconds, x / zoomLevel));
    setPlayheadTime(t);
    if (playerRef.current) playerRef.current.seekTo(Math.round(t * FPS));
  }, [scrollLeft, zoomLevel, totalSeconds]);

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col bg-zinc-950 h-screen overflow-hidden">
        <div className="h-10 border-b border-zinc-800 bg-zinc-900 animate-pulse flex-shrink-0" />
        <div className="flex flex-1 min-h-0 gap-0.5 p-0.5 pt-0">
          <div className="w-52 bg-zinc-900 animate-pulse rounded-sm" />
          <div className="flex-1 bg-black animate-pulse rounded-sm" />
          <div className="w-72 bg-zinc-900 animate-pulse rounded-sm" />
        </div>
        <div className="h-48 border-t border-zinc-800 bg-zinc-900 animate-pulse flex-shrink-0" />
      </div>
    );
  }

  if (!project) return null;

  const sel = selectedIdx !== null ? segments[selectedIdx] : null;
  const selPreview = sel ? trimPreviews[sel.id] : undefined;
  const selFirst = sel?.clips[0];
  const selLast = sel ? sel.clips[sel.clips.length - 1] : undefined;
  const timelineContentWidth = Math.max(totalSeconds * zoomLevel + 300, 800);
  const playheadLeft = TRACK_LABEL_WIDTH + playheadTime * zoomLevel - scrollLeft;

  // Unique clips for media panel
  const allClips = segments.flatMap(s => s.clips);
  const uniqueClipNames = Array.from(new Map(allClips.map(c => [c.clipId, c])).values());

  return (
    <div className="flex flex-col bg-zinc-950 h-screen overflow-hidden text-white">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 h-10 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <button
          onClick={() => router.push('/editor')}
          className="text-zinc-500 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-sm font-semibold text-white truncate">{project.title}</h1>
        <span className="text-xs text-zinc-500 flex-shrink-0 tabular-nums">
          {segments.length} seg{segments.length !== 1 ? 's' : ''} · {fmtTime(totalSeconds)}
        </span>

        {error && <span className="text-xs text-red-400 truncate flex-1">{error}</span>}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleAutoTrimAll}
            className="text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded hover:bg-zinc-800 transition-colors"
          >
            Auto-trim all
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || segments.length === 0}
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1.5 rounded transition-colors font-medium"
          >
            {exporting ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {exportProgress}%
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main 3-panel area ───────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-[3px] p-[3px] pb-0">

        {/* LEFT: Media / Assets Panel */}
        <div className="w-52 flex-shrink-0 flex flex-col bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Media</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {uniqueClipNames.length === 0 ? (
              <p className="text-[10px] text-zinc-600 text-center mt-6">No clips loaded</p>
            ) : (
              uniqueClipNames.map(clip => (
                <div
                  key={clip.clipId}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-default group"
                >
                  <div className="w-8 h-5 bg-zinc-800 border border-zinc-700 rounded flex-shrink-0 overflow-hidden">
                    {clip.videoUrl && (
                      <video
                        src={clip.videoUrl}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 truncate leading-tight">
                    {clip.clipName.replace(/\.[^.]+$/, '')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CENTER: Preview */}
        <div className="flex-1 min-w-0 flex flex-col bg-black border border-zinc-800 rounded-sm overflow-hidden">
          <div className="flex-1 min-h-0 flex items-center justify-center bg-black p-2">
            <RemotionPlayer
              ref={playerRef}
              component={TimelineComposition}
              inputProps={{ segments: compSegments, captions: compCaptions }}
              durationInFrames={Math.max(1, totalFrames)}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={FPS}
              style={{ width: '100%', maxHeight: '100%', aspectRatio: '16/9' }}
              controls
              clickToPlay
              showVolumeControls
              pauseWhenBuffering
            />
          </div>
        </div>

        {/* RIGHT: Properties / Inspector */}
        <div className="w-72 flex-shrink-0 flex flex-col bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 flex-shrink-0">
            {(['segment', 'captions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 text-xs py-2.5 font-medium capitalize transition-colors ${
                  rightTab === tab
                    ? 'text-white border-b-2 border-purple-500'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab}
                {tab === 'captions' && captions.length > 0 && (
                  <span className="ml-1 text-[10px] text-zinc-600">({captions.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto">

            {/* Segment inspector */}
            {rightTab === 'segment' && (
              sel && selectedIdx !== null ? (
                <div className="divide-y divide-zinc-800/60">
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Script line</p>
                    <p className="text-sm text-white leading-snug">{sel.scriptLine}</p>
                  </div>
                  {sel.clips.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Source</p>
                      <div className="flex flex-wrap gap-1">
                        {sel.clips.map((clip, ci) => (
                          <span key={ci} className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded">
                            {clip.clipName.split('.')[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Trim</p>
                      <button
                        onClick={() => handleAutoTrimSegment(selectedIdx)}
                        className="text-[10px] text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors"
                      >
                        Auto-trim
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Cut in</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} step={0.05} value={sel.trimStart}
                            onChange={e => patchSegment(selectedIdx, { trimStart: Math.max(0, parseFloat(e.target.value) || 0) })}
                            onBlur={() => persist(segments, captions)}
                            className="w-16 text-right bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-[10px] text-zinc-600">s</span>
                        </div>
                      </div>
                      {selPreview?.start ? (
                        <div className="relative rounded overflow-hidden border border-zinc-700 aspect-video bg-zinc-900">
                          <img src={selPreview.start} alt="" className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-zinc-300 px-1.5 py-0.5">
                            {fmtTime(selFirst ? selFirst.start + sel.trimStart : 0)}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded bg-zinc-800 border border-zinc-700 aspect-video animate-pulse" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Cut out</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number" min={0} step={0.05} value={sel.trimEnd}
                            onChange={e => patchSegment(selectedIdx, { trimEnd: Math.max(0, parseFloat(e.target.value) || 0) })}
                            onBlur={() => persist(segments, captions)}
                            className="w-16 text-right bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-[10px] text-zinc-600">s</span>
                        </div>
                      </div>
                      {selPreview?.end ? (
                        <div className="relative rounded overflow-hidden border border-zinc-700 aspect-video bg-zinc-900">
                          <img src={selPreview.end} alt="" className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-zinc-300 px-1.5 py-0.5">
                            {fmtTime(selLast ? selLast.end - sel.trimEnd : 0)}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded bg-zinc-800 border border-zinc-700 aspect-video animate-pulse" />
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Volume</p>
                      <span className="text-xs text-zinc-400 tabular-nums">{Math.round(sel.volume * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={2} step={0.05} value={sel.volume}
                      onChange={e => patchSegment(selectedIdx, { volume: parseFloat(e.target.value) })}
                      onMouseUp={() => persist(segments, captions)}
                      onTouchEnd={() => persist(segments, captions)}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Title overlay</p>
                    <input
                      type="text" placeholder="Optional…"
                      value={sel.title}
                      onChange={e => patchSegment(selectedIdx, { title: e.target.value })}
                      onBlur={() => persist(segments, captions)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <button
                      onClick={() => moveSegment(selectedIdx, -1)}
                      disabled={selectedIdx === 0}
                      className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 py-1.5 rounded transition-colors"
                    >
                      ↑ Earlier
                    </button>
                    <button
                      onClick={() => moveSegment(selectedIdx, 1)}
                      disabled={selectedIdx === segments.length - 1}
                      className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 py-1.5 rounded transition-colors"
                    >
                      ↓ Later
                    </button>
                    <button
                      onClick={() => removeSegment(selectedIdx)}
                      className="px-2.5 py-1.5 text-zinc-600 hover:text-red-400 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-zinc-600 text-center leading-relaxed">
                    Click a clip in the<br />timeline to edit it
                  </p>
                </div>
              )
            )}

            {/* Captions panel */}
            {rightTab === 'captions' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 flex-shrink-0">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {captions.length > 0 ? `${captions.length} captions` : 'No captions'}
                  </span>
                  <button
                    onClick={handleGenerateCaptions}
                    disabled={generatingCaps}
                    className="flex items-center gap-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-2 py-1 rounded transition-colors"
                  >
                    {generatingCaps && (
                      <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    {generatingCaps ? 'Generating…' : captions.length > 0 ? 'Regenerate' : 'Generate'}
                  </button>
                </div>
                {captions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-2">
                    <svg className="w-8 h-8 text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <p className="text-xs text-zinc-600 text-center">Generate captions from<br />transcription data</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto flex-1 p-3 space-y-1.5">
                    {captions.map(cap => (
                      <div key={cap.id} className="flex items-start gap-2">
                        <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-1.5 w-12 leading-tight tabular-nums">
                          {fmtTime(cap.start)}<br />{fmtTime(cap.end)}
                        </span>
                        <textarea
                          value={cap.text}
                          onChange={e => patchCaption(cap.id, e.target.value)}
                          onBlur={saveCaption}
                          rows={2}
                          className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white resize-none focus:outline-none focus:border-purple-500"
                        />
                        <button
                          onClick={() => removeCaption(cap.id)}
                          className="text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0 mt-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Timeline Panel ──────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-col bg-zinc-900 border border-zinc-800 rounded-sm mx-[3px] mb-[3px] mt-[3px] overflow-hidden" style={{ height: '220px' }}>

        {/* Timeline Toolbar */}
        <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800 flex-shrink-0 gap-4">
          {/* Left tools */}
          <div className="flex items-center gap-1">
            {/* Scissors / split icon placeholder */}
            <button className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors" title="Split (S)">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
            <button
              onClick={() => selectedIdx !== null && removeSegment(selectedIdx)}
              disabled={selectedIdx === null}
              className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="Delete selected"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
            <button
              onClick={() => selectedIdx !== null && moveSegment(selectedIdx, -1)}
              disabled={selectedIdx === null || selectedIdx === 0}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="Move earlier"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => selectedIdx !== null && moveSegment(selectedIdx, 1)}
              disabled={selectedIdx === null || selectedIdx === segments.length - 1}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors"
              title="Move later"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Center: playhead time */}
          <span className="text-xs tabular-nums text-zinc-400 font-mono">{fmtTime(playheadTime)}</span>

          {/* Right: zoom */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomLevel(z => Math.max(MIN_ZOOM, z / 1.5))}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <input
              type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={5}
              value={zoomLevel}
              onChange={e => setZoomLevel(Number(e.target.value))}
              className="w-20 accent-purple-500 cursor-pointer"
            />
            <button
              onClick={() => setZoomLevel(z => Math.min(MAX_ZOOM, z * 1.5))}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <span className="text-[10px] text-zinc-600 tabular-nums w-8 text-right">{Math.round(zoomLevel)}px</span>
          </div>
        </div>

        {/* Timeline body: labels col + scrollable tracks */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">

          {/* Track labels column */}
          <div
            className="flex-shrink-0 border-r border-zinc-800 flex flex-col"
            style={{ width: TRACK_LABEL_WIDTH }}
          >
            {/* Ruler corner */}
            <div
              className="flex-shrink-0 border-b border-zinc-800 bg-zinc-950"
              style={{ height: RULER_HEIGHT }}
            />
            {/* Video track label */}
            <div
              className="flex items-center gap-2 px-3 border-b border-zinc-800/50 bg-zinc-900"
              style={{ height: VIDEO_TRACK_HEIGHT }}
            >
              <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] text-zinc-400 font-medium truncate">Video</span>
            </div>
          </div>

          {/* Scrollable ruler + tracks */}
          <div
            ref={timelineScrollRef}
            className="flex-1 overflow-x-auto overflow-y-hidden flex flex-col"
            onScroll={e => setScrollLeft((e.target as HTMLDivElement).scrollLeft)}
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
          >
            <div style={{ width: timelineContentWidth, minWidth: '100%' }}>

              {/* Ruler */}
              <div
                className="relative bg-zinc-950 border-b border-zinc-800 cursor-crosshair select-none flex-shrink-0"
                style={{ height: RULER_HEIGHT }}
                onClick={handleRulerClick}
              >
                {rulerTicks.ticks.map(t => {
                  const x = t * zoomLevel;
                  const isMajor = t % (rulerTicks.step * 5) === 0 || rulerTicks.step >= 5;
                  return (
                    <div key={t} className="absolute top-0 flex flex-col items-start" style={{ left: x }}>
                      <div
                        className={`w-px ${isMajor ? 'bg-zinc-500' : 'bg-zinc-700'}`}
                        style={{ height: isMajor ? RULER_HEIGHT : Math.floor(RULER_HEIGHT * 0.4) }}
                      />
                      {isMajor && (
                        <span className="absolute top-1 text-[9px] text-zinc-500 tabular-nums pl-0.5 whitespace-nowrap">
                          {fmtRulerTime(t)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Video track content */}
              <div
                className="relative bg-zinc-900/50 border-b border-zinc-800/50"
                style={{ height: VIDEO_TRACK_HEIGHT }}
              >
                {segments.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-2 border-dashed border-zinc-700/50 rounded mx-2 my-2 flex-1 h-full flex items-center justify-center" style={{ width: 'calc(100% - 16px)' }}>
                      <span className="text-[10px] text-zinc-700">No segments</span>
                    </div>
                  </div>
                ) : (
                  segments.map((seg, i) => {
                    const dur = segEffectiveDuration(seg);
                    const left = segmentOffsets[i] * zoomLevel;
                    const width = Math.max(dur * zoomLevel, 4);
                    const isSelected = selectedIdx === i;
                    const clipThumb = seg.clips[0];
                    return (
                      <div
                        key={seg.id}
                        onClick={() => handleSelectSegment(i)}
                        className={`absolute top-1.5 bottom-1.5 rounded cursor-pointer overflow-hidden transition-all select-none border ${
                          isSelected
                            ? 'border-purple-400 ring-1 ring-purple-400/60 shadow-lg shadow-purple-900/30'
                            : 'border-zinc-600/60 hover:border-zinc-400'
                        }`}
                        style={{ left, width }}
                      >
                        {/* Top color bar */}
                        <div className={`absolute top-0 inset-x-0 h-0.5 ${isSelected ? 'bg-purple-400' : 'bg-violet-500/60'}`} />
                        {/* Video thumbnail bg */}
                        {clipThumb?.videoUrl && (
                          <video
                            src={clipThumb.videoUrl}
                            className="absolute inset-0 w-full h-full object-cover opacity-30"
                            muted
                            preload="metadata"
                          />
                        )}
                        <div className={`absolute inset-0 ${isSelected ? 'bg-purple-600/25' : 'bg-violet-700/20'}`} />
                        {/* Label */}
                        <div className="absolute inset-0 flex flex-col justify-between p-1.5">
                          <span className={`text-[10px] leading-tight line-clamp-2 font-medium ${isSelected ? 'text-purple-100' : 'text-zinc-200'}`}>
                            {seg.scriptLine}
                          </span>
                          <span className={`text-[9px] tabular-nums ${isSelected ? 'text-purple-300' : 'text-zinc-500'}`}>
                            {fmtTime(dur)}
                          </span>
                        </div>
                        {/* Right edge trim handle visual */}
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/10 hover:bg-white/30 cursor-ew-resize" />
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10 hover:bg-white/30 cursor-ew-resize" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Playhead (absolutely positioned over both label + tracks) */}
          {totalSeconds > 0 && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: playheadLeft, zIndex: 20 }}
            >
              {/* Vertical line */}
              <div className="absolute top-0 bottom-0 w-px bg-white/90" />
              {/* Draggable handle */}
              <button
                className="pointer-events-auto absolute w-3 h-3 rounded-full bg-white border-2 border-white/60 shadow-md cursor-col-resize -translate-x-1/2"
                style={{ top: RULER_HEIGHT - 6 }}
                onMouseDown={handlePlayheadMouseDown}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
