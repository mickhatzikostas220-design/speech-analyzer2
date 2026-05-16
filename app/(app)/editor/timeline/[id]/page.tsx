'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TimelineComposition } from '@/components/editor/TimelineComposition';
import type {
  CompositionSegment, CompositionCaption,
  CompositionTextStyle, CompositionIntroTitle, CompositionTextOverlay,
} from '@/components/editor/TimelineComposition';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RemotionPlayer = dynamic<any>(
  () => import('@remotion/player').then((m) => m.Player),
  { ssr: false, loading: () => <div className="w-full aspect-video bg-black" /> }
);

const FPS = 30;

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
  titleFontSize?: number;
  titleColor?: string;
  titleBold?: boolean;
}

interface TLCaption {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  bold: boolean;
  italic: boolean;
  shadow: boolean;
  captionPosition: 'top' | 'center' | 'bottom';
}

interface TLIntroTitle {
  text: string;
  durationSec: number;
  fontSize?: number;
  color?: string;
  bold?: boolean;
}

interface TLTextOverlay {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

interface TLProject {
  id: string;
  title: string;
  status: string;
  segments: TLSegment[];
  captions: TLCaption[];
  text_style: TextStyle | null;
  intro_title: TLIntroTitle | null;
  text_overlays: TLTextOverlay[] | null;
  created_at: string;
}

interface TrimPreview {
  start: string | null;
  end: string | null;
}

const GOOGLE_FONTS = [
  'Abril Fatface', 'Anton', 'Bebas Neue', 'Cabin', 'Dancing Script',
  'DM Sans', 'Inter', 'Josefin Sans', 'Karla', 'Lato',
  'Merriweather', 'Montserrat', 'Mulish', 'Nunito', 'Open Sans',
  'Oswald', 'Pacifico', 'Permanent Marker', 'Playfair Display', 'Plus Jakarta Sans',
  'Poppins', 'PT Sans', 'Raleway', 'Righteous', 'Roboto',
  'Source Sans 3', 'Space Grotesk', 'Ubuntu', 'Work Sans', 'Figtree',
];

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 36,
  color: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.78,
  bold: false,
  italic: false,
  shadow: false,
  captionPosition: 'bottom',
};

// ── Helpers ──────────────────────────────────────────────────
async function safeJson(res: Response) {
  try { const t = (await res.text()).trim(); return t ? JSON.parse(t) : {}; }
  catch { return { error: `Server error ${res.status}` }; }
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
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
      compSegments.push({ clips, title: seg.title, volume: seg.volume, startFrame: absFrame, titleFontSize: seg.titleFontSize, titleColor: seg.titleColor, titleBold: seg.titleBold });
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

// ── Page ─────────────────────────────────────────────────────
export default function TimelineEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);
  const frameCacheRef = useRef<Map<string, string | null>>(new Map());
  const trimDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

  const [project, setProject] = useState<TLProject | null>(null);
  const [segments, setSegments] = useState<TLSegment[]>([]);
  const [captions, setCaptions] = useState<TLCaption[]>([]);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [introTitle, setIntroTitle] = useState<TLIntroTitle>({ text: '', durationSec: 3 });
  const [textOverlays, setTextOverlays] = useState<TLTextOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [trimPreviews, setTrimPreviews] = useState<Record<string, TrimPreview>>({});
  const [generatingCaps, setGeneratingCaps] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'segment' | 'captions' | 'style'>('segment');
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');

  // ── Load Google Fonts ────────────────────────────────────────
  useEffect(() => {
    const id = 'gf-timeline';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FONTS.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`).join('&')}&display=swap`;
    document.head.appendChild(link);
  }, []);

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
        setTextStyle(p.text_style ?? DEFAULT_TEXT_STYLE);
        setIntroTitle(p.intro_title ?? { text: '', durationSec: 3 });
        setTextOverlays(p.text_overlays ?? []);
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);


  // ── Composition props ────────────────────────────────────────
  const { compSegments, compCaptions, totalFrames } = useMemo(
    () => buildCompositionProps(segments, captions),
    [segments, captions]
  );

  const introTitleComp = useMemo((): CompositionIntroTitle | null =>
    introTitle.text.trim()
      ? {
          text: introTitle.text,
          durationInFrames: Math.max(1, Math.round(introTitle.durationSec * FPS)),
          fontSize: introTitle.fontSize,
          color: introTitle.color,
          bold: introTitle.bold,
        }
      : null,
    [introTitle]
  );

  const textOverlaysComp = useMemo((): CompositionTextOverlay[] =>
    textOverlays
      .filter(o => o.text.trim() && o.endSec > o.startSec)
      .map(o => ({
        id: o.id,
        text: o.text,
        startFrame: Math.round(o.startSec * FPS),
        durationInFrames: Math.max(1, Math.round((o.endSec - o.startSec) * FPS)),
        fontSize: o.fontSize,
        color: o.color,
        bold: o.bold,
        italic: o.italic,
      })),
    [textOverlays]
  );

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

  async function persistStyle(style: TextStyle, intro: TLIntroTitle, overlays: TLTextOverlay[]) {
    await fetch(`/api/editor/timeline/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_style: style, intro_title: intro, text_overlays: overlays }),
    });
  }

  // ── Style helpers ────────────────────────────────────────────
  function patchStyle(patch: Partial<TextStyle>) {
    setTextStyle(prev => {
      const next = { ...prev, ...patch };
      persistStyle(next, introTitle, textOverlays);
      return next;
    });
  }

  function patchIntroTitle(patch: Partial<TLIntroTitle>) {
    setIntroTitle(prev => {
      const next = { ...prev, ...patch };
      persistStyle(textStyle, next, textOverlays);
      return next;
    });
  }

  function addTextOverlay() {
    const overlay: TLTextOverlay = { id: crypto.randomUUID(), text: '', startSec: 0, endSec: 3 };
    setTextOverlays(prev => {
      const next = [...prev, overlay];
      persistStyle(textStyle, introTitle, next);
      return next;
    });
  }

  function patchTextOverlay(id: string, patch: Partial<TLTextOverlay>) {
    setTextOverlays(prev => {
      const next = prev.map(o => o.id === id ? { ...o, ...patch } : o);
      persistStyle(textStyle, introTitle, next);
      return next;
    });
  }

  function removeTextOverlay(id: string) {
    setTextOverlays(prev => {
      const next = prev.filter(o => o.id !== id);
      persistStyle(textStyle, introTitle, next);
      return next;
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

  // ── Select segment + seek player ─────────────────────────────
  function handleSelectSegment(i: number) {
    setSelectedIdx(i);
    setRightTab('segment');
    loadTrimPreviews(segments[i]);
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

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden" style={{ minHeight: '82vh' }}>
        <div className="h-11 border-b border-zinc-800 bg-zinc-900 animate-pulse flex-shrink-0" />
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col">
            <div className="aspect-video bg-black animate-pulse" />
            <div className="h-28 border-t border-zinc-800 bg-zinc-900 animate-pulse" />
          </div>
          <div className="w-72 border-l border-zinc-800 bg-zinc-900 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const totalSeconds = totalFrames / FPS;
  const sel = selectedIdx !== null ? segments[selectedIdx] : null;
  const selPreview = sel ? trimPreviews[sel.id] : undefined;
  const selFirst = sel?.clips[0];
  const selLast = sel ? sel.clips[sel.clips.length - 1] : undefined;
  const rawDur = sel ? sel.clips.reduce((s, c) => s + (c.end - c.start), 0) : 0;
  const maxTrimStart = Math.max(0, rawDur - (sel?.trimEnd ?? 0) - 0.1);
  const maxTrimEnd = Math.max(0, rawDur - (sel?.trimStart ?? 0) - 0.1);

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden" style={{ minHeight: '82vh' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={() => router.push('/editor')}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-sm font-medium text-white truncate">{project.title}</h1>
        <span className="text-xs text-zinc-600 flex-shrink-0 tabular-nums">
          {segments.length} seg{segments.length !== 1 ? 's' : ''} · {fmtTime(totalSeconds)}
        </span>

        {error && (
          <span className="text-xs text-red-400 truncate flex-1">{error}</span>
        )}

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
            className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors font-medium"
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

      {/* ── Main ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: Player + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Player */}
          <div className="bg-black flex-shrink-0">
            <RemotionPlayer
              ref={playerRef}
              component={TimelineComposition}
              inputProps={{ segments: compSegments, captions: compCaptions, textStyle: textStyle as CompositionTextStyle, introTitle: introTitleComp, textOverlays: textOverlaysComp }}
              durationInFrames={Math.max(1, totalFrames)}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={FPS}
              style={{ width: '100%', aspectRatio: '16/9' }}
              controls
              clickToPlay
              showVolumeControls
              pauseWhenBuffering
            />
          </div>

          {/* Timeline strip */}
          <div className="border-t border-zinc-800 flex-shrink-0 flex flex-col" style={{ minHeight: '7rem' }}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60">
              <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Timeline</span>
              <span className="text-[10px] text-zinc-700 tabular-nums">{fmtTime(totalSeconds)}</span>
            </div>

            <div className="flex items-stretch gap-1 px-2 py-2 overflow-x-auto flex-1">
              {segments.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-zinc-700">No segments — bring a project from the Script Editor</p>
                </div>
              ) : (
                segments.map((seg, i) => {
                  const dur = segEffectiveDuration(seg);
                  const isSelected = selectedIdx === i;
                  return (
                    <button
                      key={seg.id}
                      onClick={() => handleSelectSegment(i)}
                      style={{ flexGrow: Math.max(dur, 0.5), flexBasis: 0, minWidth: 72 }}
                      className={`relative flex flex-col justify-between text-left rounded-md px-2 py-1.5 overflow-hidden transition-all border ${
                        isSelected
                          ? 'bg-purple-600/20 border-purple-500 ring-1 ring-inset ring-purple-500/60'
                          : 'bg-zinc-800/70 border-zinc-700/60 hover:border-zinc-500'
                      }`}
                    >
                      {/* Colour bar at top */}
                      <div className={`absolute top-0 inset-x-0 h-0.5 ${isSelected ? 'bg-purple-400' : 'bg-zinc-600'}`} />
                      <span className={`text-[11px] leading-tight line-clamp-2 mt-0.5 ${isSelected ? 'text-purple-100' : 'text-zinc-300'}`}>
                        {seg.scriptLine}
                      </span>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-[10px] tabular-nums ${isSelected ? 'text-purple-400' : 'text-zinc-600'}`}>
                          {fmtTime(dur)}
                        </span>
                        {seg.clips[0] && (
                          <span className={`text-[9px] truncate max-w-[55%] ${isSelected ? 'text-purple-400/70' : 'text-zinc-700'}`}>
                            {seg.clips[0].clipName.split('.')[0]}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Inspector / Captions */}
        <div className="w-72 border-l border-zinc-800 flex flex-col flex-shrink-0">

          {/* Tabs */}
          <div className="flex border-b border-zinc-800 flex-shrink-0">
            {(['segment', 'captions', 'style'] as const).map(tab => (
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

            {/* ── Segment inspector ─────────────────────────── */}
            {rightTab === 'segment' && (
              sel && selectedIdx !== null ? (
                <div className="divide-y divide-zinc-800/60">

                  {/* Script line */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Script line</p>
                    <p className="text-sm text-white leading-snug">{sel.scriptLine}</p>
                  </div>

                  {/* Source clips */}
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

                  {/* Trim */}
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

                    {/* Trim start */}
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
                      <input
                        type="range" min={0} max={maxTrimStart} step={0.05} value={sel.trimStart}
                        onChange={e => patchSegment(selectedIdx, { trimStart: Math.max(0, parseFloat(e.target.value)) })}
                        onMouseUp={() => persist(segments, captions)}
                        onTouchEnd={() => persist(segments, captions)}
                        className="w-full accent-purple-500"
                      />
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

                    {/* Trim end */}
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
                      <input
                        type="range" min={0} max={maxTrimEnd} step={0.05} value={sel.trimEnd}
                        onChange={e => patchSegment(selectedIdx, { trimEnd: Math.max(0, parseFloat(e.target.value)) })}
                        onMouseUp={() => persist(segments, captions)}
                        onTouchEnd={() => persist(segments, captions)}
                        className="w-full accent-purple-500"
                      />
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

                  {/* Volume */}
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

                  {/* Title overlay */}
                  <div className="px-4 py-3 space-y-2.5">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Title overlay</p>
                    <input
                      type="text" placeholder="Optional…"
                      value={sel.title}
                      onChange={e => patchSegment(selectedIdx, { title: e.target.value })}
                      onBlur={() => persist(segments, captions)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                    />
                    {sel.title.trim() && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-6 flex-shrink-0">Size</span>
                          <input
                            type="range" min={16} max={120} step={2}
                            value={sel.titleFontSize ?? Math.round(textStyle.fontSize * 1.1)}
                            onChange={e => patchSegment(selectedIdx, { titleFontSize: parseInt(e.target.value) })}
                            onMouseUp={() => persist(segments, captions)}
                            onTouchEnd={() => persist(segments, captions)}
                            className="flex-1 accent-purple-500"
                          />
                          <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                            {sel.titleFontSize ?? Math.round(textStyle.fontSize * 1.1)}px
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-6 flex-shrink-0">Color</span>
                          <input
                            type="color"
                            value={sel.titleColor ?? textStyle.color}
                            onChange={e => patchSegment(selectedIdx, { titleColor: e.target.value })}
                            onBlur={() => persist(segments, captions)}
                            className="w-7 h-5 rounded cursor-pointer border border-zinc-600 bg-transparent flex-shrink-0"
                          />
                          <div className="flex gap-1 ml-auto">
                            <button
                              onClick={() => { patchSegment(selectedIdx, { titleBold: !(sel.titleBold ?? true) }); persist(segments, captions); }}
                              className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${(sel.titleBold ?? true) ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                            >B</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-3 flex items-center gap-2">
                    <button
                      onClick={() => moveSegment(selectedIdx, -1)}
                      disabled={selectedIdx === 0}
                      title="Move earlier"
                      className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 py-1.5 rounded transition-colors"
                    >
                      ↑ Earlier
                    </button>
                    <button
                      onClick={() => moveSegment(selectedIdx, 1)}
                      disabled={selectedIdx === segments.length - 1}
                      title="Move later"
                      className="flex-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 py-1.5 rounded transition-colors"
                    >
                      ↓ Later
                    </button>
                    <button
                      onClick={() => removeSegment(selectedIdx)}
                      title="Remove segment"
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
                  <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-zinc-600 text-center leading-relaxed">
                    Click a segment<br />in the timeline to edit it
                  </p>
                </div>
              )
            )}

            {/* ── Captions panel ────────────────────────────── */}
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

            {/* ── Style panel ───────────────────────────────── */}
            {rightTab === 'style' && (
              <div className="overflow-y-auto flex-1 divide-y divide-zinc-800/60">

                {/* Font */}
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Font</p>

                  {/* Font picker */}
                  <div className="relative">
                    <button
                      onClick={() => { setFontPickerOpen(o => !o); setFontSearch(''); }}
                      className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded px-2.5 py-1.5 text-xs text-white transition-colors"
                      style={{ fontFamily: `'${textStyle.fontFamily}', system-ui, sans-serif` }}
                    >
                      <span>{textStyle.fontFamily}</span>
                      <svg className="w-3 h-3 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {fontPickerOpen && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-zinc-800">
                          <input
                            autoFocus
                            value={fontSearch}
                            onChange={e => setFontSearch(e.target.value)}
                            placeholder="Search fonts…"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div className="overflow-y-auto max-h-48">
                          {GOOGLE_FONTS
                            .filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
                            .map(f => (
                              <button
                                key={f}
                                onClick={() => { patchStyle({ fontFamily: f }); setFontPickerOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-zinc-800 ${textStyle.fontFamily === f ? 'text-purple-400 bg-purple-900/20' : 'text-zinc-300'}`}
                                style={{ fontFamily: `'${f}', system-ui, sans-serif` }}
                              >
                                {f}
                              </button>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview */}
                  <div
                    className="text-center text-sm py-2 px-3 rounded bg-zinc-800 border border-zinc-700/50 text-white truncate"
                    style={{ fontFamily: `'${textStyle.fontFamily}', system-ui, sans-serif`, fontWeight: textStyle.bold ? 700 : 400, fontStyle: textStyle.italic ? 'italic' : 'normal' }}
                  >
                    The quick brown fox
                  </div>
                </div>

                {/* Text */}
                <div className="px-4 py-3 space-y-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Text</p>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Size</span>
                      <span className="text-xs text-zinc-400 tabular-nums">{textStyle.fontSize}px</span>
                    </div>
                    <input
                      type="range" min={16} max={96} step={2} value={textStyle.fontSize}
                      onChange={e => patchStyle({ fontSize: parseInt(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Color</span>
                    <input
                      type="color" value={textStyle.color}
                      onChange={e => patchStyle({ color: e.target.value })}
                      className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => patchStyle({ bold: !textStyle.bold })}
                      className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${textStyle.bold ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >B</button>
                    <button
                      onClick={() => patchStyle({ italic: !textStyle.italic })}
                      className={`flex-1 py-1 rounded text-xs italic transition-colors ${textStyle.italic ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >I</button>
                    <button
                      onClick={() => patchStyle({ shadow: !textStyle.shadow })}
                      className={`flex-1 py-1 rounded text-xs transition-colors ${textStyle.shadow ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                      style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.9)' }}
                    >S</button>
                  </div>
                </div>

                {/* Background */}
                <div className="px-4 py-3 space-y-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Background</p>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Color</span>
                    <input
                      type="color" value={textStyle.bgColor}
                      onChange={e => patchStyle({ bgColor: e.target.value })}
                      className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Opacity</span>
                      <span className="text-xs text-zinc-400 tabular-nums">{Math.round(textStyle.bgOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.05} value={textStyle.bgOpacity}
                      onChange={e => patchStyle({ bgOpacity: parseFloat(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>

                {/* Position */}
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Caption position</p>
                  <div className="flex gap-1.5">
                    {(['top', 'center', 'bottom'] as const).map(pos => (
                      <button
                        key={pos}
                        onClick={() => patchStyle({ captionPosition: pos })}
                        className={`flex-1 py-1 rounded text-xs capitalize transition-colors ${textStyle.captionPosition === pos ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Intro title */}
                <div className="px-4 py-3 space-y-3">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Intro title</p>
                  <input
                    type="text"
                    value={introTitle.text}
                    onChange={e => patchIntroTitle({ text: e.target.value })}
                    placeholder="Title text…"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Duration</span>
                      <span className="text-xs text-zinc-400 tabular-nums">{introTitle.durationSec.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range" min={0.5} max={10} step={0.5} value={introTitle.durationSec}
                      onChange={e => patchIntroTitle({ durationSec: parseFloat(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Size</span>
                      <span className="text-xs text-zinc-400 tabular-nums">{introTitle.fontSize ?? Math.round(textStyle.fontSize * 1.5)}px</span>
                    </div>
                    <input
                      type="range" min={16} max={160} step={2}
                      value={introTitle.fontSize ?? Math.round(textStyle.fontSize * 1.5)}
                      onChange={e => patchIntroTitle({ fontSize: parseInt(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Color</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => patchIntroTitle({ color: undefined })}
                        className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                        title="Reset to global color"
                      >reset</button>
                      <input
                        type="color"
                        value={introTitle.color ?? textStyle.color}
                        onChange={e => patchIntroTitle({ color: e.target.value })}
                        className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => patchIntroTitle({ bold: !(introTitle.bold ?? true) })}
                      className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${(introTitle.bold ?? true) ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                    >B</button>
                  </div>
                </div>

                {/* Text overlays */}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Text overlays</p>
                    <button
                      onClick={addTextOverlay}
                      className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  {textOverlays.length === 0 && (
                    <p className="text-xs text-zinc-700">No overlays yet — click Add to create one.</p>
                  )}

                  <div className="space-y-3">
                    {textOverlays.map(ov => (
                      <div key={ov.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-2.5 space-y-2">
                        {/* Text + delete */}
                        <div className="flex items-start gap-1.5">
                          <input
                            type="text"
                            value={ov.text}
                            onChange={e => patchTextOverlay(ov.id, { text: e.target.value })}
                            placeholder="Overlay text…"
                            className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                          />
                          <button
                            onClick={() => removeTextOverlay(ov.id)}
                            className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Timing */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[10px] text-zinc-500 w-6">from</span>
                            <input
                              type="number" min={0} step={0.1} value={ov.startSec}
                              onChange={e => patchTextOverlay(ov.id, { startSec: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-[10px] text-zinc-600">s</span>
                          </div>
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[10px] text-zinc-500 w-4">to</span>
                            <input
                              type="number" min={0} step={0.1} value={ov.endSec}
                              onChange={e => patchTextOverlay(ov.id, { endSec: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-white text-right focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-[10px] text-zinc-600">s</span>
                          </div>
                        </div>

                        {/* Size */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-6 flex-shrink-0">Size</span>
                          <input
                            type="range" min={16} max={120} step={2}
                            value={ov.fontSize ?? textStyle.fontSize}
                            onChange={e => patchTextOverlay(ov.id, { fontSize: parseInt(e.target.value) })}
                            className="flex-1 accent-purple-500"
                          />
                          <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">{ov.fontSize ?? textStyle.fontSize}px</span>
                        </div>

                        {/* Color + B I toggles */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-6 flex-shrink-0">Color</span>
                          <input
                            type="color"
                            value={ov.color ?? textStyle.color}
                            onChange={e => patchTextOverlay(ov.id, { color: e.target.value })}
                            className="w-7 h-5 rounded cursor-pointer border border-zinc-600 bg-transparent flex-shrink-0"
                          />
                          <div className="flex gap-1 ml-auto">
                            <button
                              onClick={() => patchTextOverlay(ov.id, { bold: !(ov.bold ?? textStyle.bold) })}
                              className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${(ov.bold ?? textStyle.bold) ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`}
                            >B</button>
                            <button
                              onClick={() => patchTextOverlay(ov.id, { italic: !(ov.italic ?? textStyle.italic) })}
                              className={`px-2 py-0.5 rounded text-xs italic transition-colors ${(ov.italic ?? textStyle.italic) ? 'bg-purple-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:text-white'}`}
                            >I</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
