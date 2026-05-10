'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TimelineComposition } from '@/components/editor/TimelineComposition';
import type {
  CompositionSegment,
  CompositionCaption,
} from '@/components/editor/TimelineComposition';

// Remotion Player — client-only (uses browser APIs at load time)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RemotionPlayer = dynamic<any>(
  () => import('@remotion/player').then((m) => m.Player),
  { ssr: false, loading: () => <div className="w-full aspect-video bg-zinc-900 rounded-xl animate-pulse" /> }
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
    for (const clip of seg.clips) {
      const effStart = clip.start + seg.trimStart;
      const effEnd = clip.end - seg.trimEnd;
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
  return seg.clips.reduce((s, c) => s + Math.max(0, (c.end - seg.trimEnd) - (c.start + seg.trimStart)), 0);
}

// Convert editor state → Remotion composition props
function buildCompositionProps(segments: TLSegment[], captions: TLCaption[]): {
  compSegments: CompositionSegment[];
  compCaptions: CompositionCaption[];
  totalFrames: number;
} {
  let absFrame = 0;
  const compSegments: CompositionSegment[] = [];

  for (const seg of segments) {
    const clips = seg.clips
      .map((clip) => {
        const effStart = clip.start + seg.trimStart;
        const effEnd = clip.end - seg.trimEnd;
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

  const compCaptions: CompositionCaption[] = captions.map((cap) => ({
    text: cap.text,
    startFrame: Math.round(cap.start * FPS),
    endFrame: Math.round(cap.end * FPS),
  }));

  return { compSegments, compCaptions, totalFrames: absFrame };
}

// ── Page ─────────────────────────────────────────────────────
export default function TimelineEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);

  const [project, setProject] = useState<TLProject | null>(null);
  const [segments, setSegments] = useState<TLSegment[]>([]);
  const [captions, setCaptions] = useState<TLCaption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingCaps, setGeneratingCaps] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/editor/timeline/${params.id}`)
      .then(safeJson)
      .then(d => {
        if (d.error) { router.push('/editor'); return; }
        const p = d as TLProject;
        const segs = (p.segments ?? []).map(s => ({
          ...s,
          trimStart: s.trimStart ?? 0,
          trimEnd: s.trimEnd ?? 0,
          title: s.title ?? '',
          volume: s.volume ?? 1,
        }));
        setProject(p);
        setSegments(segs);
        setCaptions(p.captions ?? []);
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);

  // ── Composition props (reactive to segment/caption edits) ─
  const { compSegments, compCaptions, totalFrames } = useMemo(
    () => buildCompositionProps(segments, captions),
    [segments, captions]
  );

  // ── Persist ──────────────────────────────────────────────
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

  // ── Segment ops ──────────────────────────────────────────
  function moveSegment(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= segments.length) return;
    const next = [...segments];
    [next[i], next[j]] = [next[j], next[i]];
    setSegments(next);
    persist(next, captions);
  }

  function removeSegment(i: number) {
    const next = segments.filter((_, idx) => idx !== i);
    setSegments(next);
    persist(next, captions);
  }

  function patchSegment(i: number, patch: Partial<TLSegment>) {
    setSegments(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }

  // ── Caption ops ──────────────────────────────────────────
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

  // ── Export (ffmpeg.wasm) ─────────────────────────────────
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
        for (const clip of seg.clips) {
          const effStart = clip.start + seg.trimStart;
          const effEnd = clip.end - seg.trimEnd;
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

  // ── Render ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 bg-zinc-900 rounded-xl h-96 animate-pulse" />
          <div className="col-span-2 bg-zinc-900 rounded-xl h-96 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const totalSeconds = totalFrames / FPS;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/editor')} className="text-zinc-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">{project.title}</h1>
        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
          {segments.length} segments · {fmtTime(totalSeconds)}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Remotion Player (full width) ─────────────────── */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
        <RemotionPlayer
          component={TimelineComposition}
          inputProps={{ segments: compSegments, captions: compCaptions }}
          durationInFrames={Math.max(1, totalFrames)}
          compositionWidth={1920}
          compositionHeight={1080}
          fps={FPS}
          style={{ width: '100%', aspectRatio: '16/9' }}
          controls
          clickToPlay
          showVolumeControls
        />
        {totalFrames === 0 && (
          <p className="text-xs text-zinc-600 text-center py-3">
            Add segments from the Script Editor to see a preview here.
          </p>
        )}
      </div>

      <div className="grid grid-cols-5 gap-6 items-start">
        {/* ── LEFT: Segments ─────────────────────────────── */}
        <div className="col-span-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-white">Segments</p>
            <p className="text-xs text-zinc-500">Reorder · trim · volume · title overlay</p>
          </div>

          {segments.length === 0 ? (
            <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
              <p className="text-sm text-zinc-600">No segments — bring a project here from the Script Editor.</p>
            </div>
          ) : (
            segments.map((seg, i) => (
              <div key={seg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 flex items-start gap-3">
                  {/* Reorder arrows */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
                    <button onClick={() => moveSegment(i, -1)} disabled={i === 0}
                      className="text-zinc-600 hover:text-white disabled:opacity-20 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button onClick={() => moveSegment(i, 1)} disabled={i === segments.length - 1}
                      className="text-zinc-600 hover:text-white disabled:opacity-20 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm text-white truncate" title={seg.scriptLine}>{seg.scriptLine}</p>

                    {/* Clip source tags */}
                    <div className="flex flex-wrap gap-1">
                      {seg.clips.map((clip, ci) => (
                        <span key={ci} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-md whitespace-nowrap">
                          {clip.clipName.split('.')[0]} · {fmtTime(clip.start + seg.trimStart)}–{fmtTime(clip.end - seg.trimEnd)}
                        </span>
                      ))}
                    </div>

                    {/* Trim + volume */}
                    <div className="flex flex-wrap gap-3 items-center">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Trim start
                        <input type="number" min={0} step={0.1} value={seg.trimStart}
                          onChange={e => patchSegment(i, { trimStart: Math.max(0, parseFloat(e.target.value) || 0) })}
                          onBlur={() => persist(segments, captions)}
                          className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-purple-500"
                        />s
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Trim end
                        <input type="number" min={0} step={0.1} value={seg.trimEnd}
                          onChange={e => patchSegment(i, { trimEnd: Math.max(0, parseFloat(e.target.value) || 0) })}
                          onBlur={() => persist(segments, captions)}
                          className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none focus:border-purple-500"
                        />s
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Volume
                        <input type="range" min={0} max={2} step={0.05} value={seg.volume}
                          onChange={e => patchSegment(i, { volume: parseFloat(e.target.value) })}
                          onMouseUp={() => persist(segments, captions)}
                          onTouchEnd={() => persist(segments, captions)}
                          className="w-20 accent-purple-500"
                        />
                        <span className="w-8 text-zinc-400">{Math.round(seg.volume * 100)}%</span>
                      </label>
                    </div>

                    {/* Title overlay */}
                    <input type="text" placeholder="Title overlay (optional)…" value={seg.title}
                      onChange={e => patchSegment(i, { title: e.target.value })}
                      onBlur={() => persist(segments, captions)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Remove */}
                  <button onClick={() => removeSegment(i)}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1 flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── RIGHT: Captions ────────────────────────────── */}
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 sticky top-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Captions</p>
            <button
              onClick={handleGenerateCaptions}
              disabled={generatingCaps}
              className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {generatingCaps ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Generating…
                </>
              ) : captions.length > 0 ? 'Regenerate' : 'Generate Captions'}
            </button>
          </div>

          {captions.length === 0 ? (
            <p className="text-xs text-zinc-600 py-4 text-center">
              Click Generate Captions to auto-create from transcriptions.
            </p>
          ) : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
              {captions.map(cap => (
                <div key={cap.id} className="flex items-start gap-2">
                  <span className="text-xs text-zinc-600 flex-shrink-0 mt-1.5 w-20 leading-tight">
                    {fmtTime(cap.start)}<br />{fmtTime(cap.end)}
                  </span>
                  <textarea
                    value={cap.text}
                    onChange={e => patchCaption(cap.id, e.target.value)}
                    onBlur={saveCaption}
                    rows={2}
                    className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white resize-none focus:outline-none focus:border-purple-500"
                  />
                  <button onClick={() => removeCaption(cap.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 mt-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Export bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        {exporting && (
          <div className="space-y-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 transition-all duration-300" style={{ width: `${exportProgress}%` }} />
            </div>
            <p className="text-xs text-zinc-500 text-center">{exportProgress}%</p>
          </div>
        )}
        <button
          onClick={handleExport}
          disabled={exporting || segments.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          {exporting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Exporting…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export with Captions
            </>
          )}
        </button>
        <p className="text-xs text-zinc-600 text-center">
          Captions baked in · Title overlays at top · Volume per segment
        </p>
      </div>
    </div>
  );
}
