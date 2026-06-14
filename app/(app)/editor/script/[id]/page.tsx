'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { maybeCompressMedia, COMPRESS_TARGET_BYTES } from '@/lib/editor/compress';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface SpeechSegment {
  start: number;
  end: number;
}

interface ScriptClip {
  id: string;
  name: string;
  path: string;
  duration: number | null;
  transcribed: boolean;
  transcription: WordTimestamp[];
  speechSegments: SpeechSegment[];
  videoUrl?: string | null;
}

// One clip slice assigned to a script line
interface SegmentClip {
  clipId: string;
  clipName: string;
  start: number;
  end: number;
}

interface ScriptSegment {
  id: string;
  scriptLine: string;
  clips: SegmentClip[];   // ordered list — can be multiple per line
  confidence: number;
}

interface ScriptProject {
  id: string;
  title: string;
  script: string;
  status: string;
  clips: ScriptClip[];
  segments: ScriptSegment[];
  created_at: string;
}

async function safeJson(res: Response) {
  try {
    const text = (await res.text()).trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Server error ${res.status}` };
  }
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

// Migrate segments stored in the old single-clip format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateSegment(raw: any): ScriptSegment {
  if (Array.isArray(raw.clips)) return raw as ScriptSegment;
  const sc: SegmentClip[] = raw.clipId
    ? [{ clipId: raw.clipId, clipName: raw.clipName ?? '', start: raw.start ?? 0, end: raw.end ?? 0 }]
    : [];
  return { id: raw.id, scriptLine: raw.scriptLine, clips: sc, confidence: raw.confidence ?? 0 };
}

// ── Script matching algorithm ────────────────────────────────
function normalizeWord(w: string) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return curr[b.length];
}

function wordSim(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function cleanScriptLine(line: string): string {
  return line
    .replace(/\[.*?\]/g, '')
    .replace(/<.*?>/g, '')
    .replace(/^[\s:]+/, '')
    .replace(/["""]/g, '')
    .trim();
}

// Greedy forward scan starting at `startFrom`.
// Returns the best match together with lastMatchedIdx so the caller can
// advance the search cursor and prevent the next line from overlapping.
function findBestMatch(
  scriptWords: string[],
  trans: { norm: string; start: number; end: number }[],
  startFrom = 0,
): { score: number; start: number; end: number; lastMatchedIdx: number } | null {
  // Small padding around the matched words. Kept tight so adjacent clips don't
  // bleed into each other at the seams when segments are assembled.
  const BUFFER = 0.1;
  const searchRange = scriptWords.length * 4;

  let bestScore = 0;
  let best: { score: number; start: number; end: number; lastMatchedIdx: number } | null = null;

  for (let i = startFrom; i < trans.length; i++) {
    let si = 0;
    let totalSim = 0;
    let firstMatchedIdx = -1;
    let lastMatchedIdx = i;
    const limit = Math.min(trans.length, i + searchRange);

    for (let wi = i; wi < limit && si < scriptWords.length; wi++) {
      const sim = wordSim(scriptWords[si], trans[wi].norm);
      if (sim >= 0.65) {
        totalSim += sim;
        if (firstMatchedIdx === -1) firstMatchedIdx = wi;
        lastMatchedIdx = wi;
        si++;
      }
    }

    // Skip positions where nothing matched at all
    if (firstMatchedIdx === -1) continue;

    const score = totalSim / scriptWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = {
        score,
        // Clip starts at the FIRST matched word, not the scan start position
        start: Math.max(0, trans[firstMatchedIdx].start - BUFFER),
        end: trans[lastMatchedIdx].end + BUFFER,
        lastMatchedIdx,
      };
    }
  }

  return bestScore > 0 ? best : null;
}

function matchScriptToClips(script: string, clips: ScriptClip[]): ScriptSegment[] {
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);

  // Pre-normalise each clip's transcription once
  const transCache = new Map<string, { norm: string; start: number; end: number }[]>();
  for (const clip of clips) {
    if (clip.transcribed && clip.transcription.length) {
      transCache.set(clip.id, clip.transcription.map(w => ({ norm: normalizeWord(w.word), start: w.start, end: w.end })));
    }
  }

  // Per-clip cursor: next line must start at or after this word index
  const clipNextStart = new Map<string, number>();

  const segments = lines.map((line) => {
    const cleaned = cleanScriptLine(line);
    const scriptWords = cleaned.split(/\s+/).map(normalizeWord).filter(Boolean);
    if (!scriptWords.length) return { id: crypto.randomUUID(), scriptLine: line, clips: [], confidence: 0 };

    let bestScore = 0;
    let bestClip: SegmentClip | null = null;
    let bestClipId: string | null = null;
    let bestLastIdx = 0;

    for (const clip of clips) {
      const trans = transCache.get(clip.id);
      if (!trans) continue;
      const startFrom = clipNextStart.get(clip.id) ?? 0;
      const result = findBestMatch(scriptWords, trans, startFrom);
      if (result && result.score > bestScore) {
        bestScore = result.score;
        bestClip = { clipId: clip.id, clipName: clip.name, start: result.start, end: result.end };
        bestClipId = clip.id;
        bestLastIdx = result.lastMatchedIdx;
      }
    }

    // Advance this clip's cursor so the next line can't reuse the same words
    if (bestClipId !== null) clipNextStart.set(bestClipId, bestLastIdx + 1);

    return {
      id: crypto.randomUUID(),
      scriptLine: line,
      clips: bestScore > 0.25 && bestClip ? [bestClip] : [],
      confidence: bestScore,
    };
  });

  // Fix buffer overlap at seams between consecutive lines from the same clip:
  // if line N ends at T1 and line N+1 starts at T0 < T1 (same clip), cut at midpoint.
  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i];
    const next = segments[i + 1];
    if (!curr.clips.length || !next.clips.length) continue;
    const currLast = curr.clips[curr.clips.length - 1];
    const nextFirst = next.clips[0];
    if (currLast.clipId !== nextFirst.clipId) continue;
    if (currLast.end > nextFirst.start) {
      const mid = (currLast.end + nextFirst.start) / 2;
      currLast.end = mid;
      nextFirst.start = mid;
    }
  }

  return segments;
}

// Narrow a speech segment to just the words matching the script line
function narrowToScriptLine(
  scriptLine: string,
  clip: ScriptClip,
  spStart: number,
  spEnd: number,
): { start: number; end: number } {
  const cleaned = cleanScriptLine(scriptLine);
  const scriptWords = cleaned.split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!scriptWords.length) return { start: spStart, end: spEnd };

  const trans = (clip.transcription ?? [])
    .filter(w => w.start >= spStart - 0.1 && w.end <= spEnd + 0.1)
    .map(w => ({ norm: normalizeWord(w.word), start: w.start, end: w.end }));

  if (!trans.length) return { start: spStart, end: spEnd };

  const result = findBestMatch(scriptWords, trans);
  if (!result || result.score <= 0.25) return { start: spStart, end: spEnd };

  return {
    start: Math.max(spStart, result.start),
    end: Math.min(spEnd, result.end),
  };
}

// Default word-aligned trim (seconds) for one outer edge of a segment, so
// consecutive segments butt up against speech instead of silence/padding.
function edgeTrim(
  clip: ScriptClip | undefined,
  sliceStart: number,
  sliceEnd: number,
  edge: 'start' | 'end',
): number {
  const BUF = 0.05;
  if (!clip) return 0;
  const words = (clip.transcription ?? [])
    .filter((w) => w.start >= sliceStart - 0.05 && w.end <= sliceEnd + 0.05)
    .sort((a, b) => a.start - b.start);
  if (!words.length) return 0;
  const raw = edge === 'start'
    ? words[0].start - sliceStart - BUF
    : sliceEnd - words[words.length - 1].end - BUF;
  return Math.max(0, Math.round(raw * 100) / 100);
}

// ── Main page ────────────────────────────────────────────────
export default function ScriptEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);
  const scriptSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewEndRef = useRef<number>(0);

  const [project, setProject] = useState<ScriptProject | null>(null);
  const [clips, setClips] = useState<ScriptClip[]>([]);
  const [script, setScript] = useState('');
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [pickingForSegId, setPickingForSegId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [bringing, setBringing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load project ───────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/editor/script/${params.id}`)
      .then(safeJson)
      .then((d) => {
        if (d.error) { router.push('/editor'); return; }
        const p = d as ScriptProject;
        setProject(p);
        setClips(p.clips ?? []);
        setScript(p.script ?? '');
        setSegments((p.segments ?? []).map(migrateSegment));
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);

  // Pause preview when picker closes
  useEffect(() => {
    if (!pickingForSegId) {
      previewRef.current?.pause();
      setPreviewKey(null);
    }
  }, [pickingForSegId]);

  // ── Lazy-load ffmpeg.wasm ──────────────────────────────────
  async function getFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  // ── Get fresh signed URL for a clip ───────────────────────
  async function getFreshClipUrl(clipId: string): Promise<string | null> {
    const d = await safeJson(await fetch(`/api/editor/script/${params.id}`));
    return (d.clips as ScriptClip[] | undefined)?.find((c) => c.id === clipId)?.videoUrl ?? null;
  }

  // ── Save clips to server ───────────────────────────────────
  async function saveClips(updated: ScriptClip[]) {
    const toSave = updated.map(({ videoUrl: _v, ...rest }) => rest);
    await fetch(`/api/editor/script/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips: toSave }),
    });
  }

  // ── Save segments to server ────────────────────────────────
  async function saveSegments(updated: ScriptSegment[]) {
    await fetch(`/api/editor/script/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments: updated }),
    });
  }

  // ── Upload clips ───────────────────────────────────────────
  async function handleUploadClips(files: FileList) {
    setUploadMsg('Uploading...');
    setError(null);
    try {
      const newClips: ScriptClip[] = [...clips];

      for (let i = 0; i < files.length; i++) {
        const original = files[i];

        // Compress large clips in the browser so they fit under the Storage limit.
        let file = original;
        if (original.size > COMPRESS_TARGET_BYTES) {
          setUploadMsg(`Compressing ${i + 1} of ${files.length}: ${original.name}…`);
          const ffmpeg = await getFFmpeg();
          file = await maybeCompressMedia(ffmpeg, original, {
            onProgress: (r) => setUploadMsg(`Compressing ${i + 1} of ${files.length}: ${Math.round(r * 100)}%`),
          });
        }

        setUploadMsg(`Uploading ${i + 1} of ${files.length}: ${original.name}`);

        const signRes = await fetch(`/api/editor/script/${params.id}/signed-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        });
        const signData = await safeJson(signRes);
        if (signData.error) throw new Error(`Could not get upload URL: ${signData.error}`);

        const { signedUrl, path, clipId } = signData as { signedUrl: string; path: string; clipId: string };

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'video/mp4', 'x-upsert': 'true' },
        });
        if (!uploadRes.ok) {
          const msg = await uploadRes.text().catch(() => uploadRes.status.toString());
          throw new Error(`Upload failed: ${msg}`);
        }

        const { data: signed } = await supabase.storage.from('speeches').createSignedUrl(path, 3600);
        const videoUrl = signed?.signedUrl ?? null;

        const newClip: ScriptClip = {
          id: clipId, name: original.name, path,
          duration: null, transcribed: false,
          transcription: [], speechSegments: [],
          videoUrl: videoUrl ?? null,
        };
        newClips.push(newClip);
        setClips([...newClips]);
        await saveClips(newClips);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadMsg(null);
    }
  }

  // ── Delete clip ────────────────────────────────────────────
  async function handleDeleteClip(clipId: string) {
    const updated = clips.filter((c) => c.id !== clipId);
    setClips(updated);
    await saveClips(updated);
  }

  // ── Transcribe single clip ─────────────────────────────────
  async function handleTranscribeClip(clip: ScriptClip) {
    setTranscribingId(clip.id);
    setError(null);
    try {
      const ffmpeg = await getFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');

      const freshUrl = await getFreshClipUrl(clip.id);
      if (!freshUrl) throw new Error(`Could not get URL for clip: ${clip.name}`);

      const inputName = `clip_input_${clip.id}.mp4`;
      const audioName = `clip_audio_${clip.id}.mp3`;

      await ffmpeg.writeFile(inputName, await fetchFile(freshUrl));
      await ffmpeg.exec(['-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '32k', audioName]);

      const audioData = await ffmpeg.readFile(audioName);
      const audioBlob = new Blob([new Uint8Array(audioData as ArrayBuffer)], { type: 'audio/mpeg' });

      const form = new FormData();
      form.append('audio', audioBlob);

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await safeJson(res);
      if (data.error) throw new Error(data.error as string);
      const words: WordTimestamp[] = (data.words as WordTimestamp[]) ?? [];

      // Silence detect for manual picker
      const silLogs: string[] = [];
      const silHandler = ({ message }: { message: string }) => silLogs.push(message);
      ffmpeg.on('log', silHandler);
      await ffmpeg.exec(['-i', inputName, '-af', 'silencedetect=noise=-30dB:d=0.3', '-f', 'null', '-']);
      ffmpeg.off('log', silHandler);

      const logText = silLogs.join('\n');
      const silStarts = Array.from(logText.matchAll(/silence_start: ([\d.]+)/g)).map((m) => parseFloat(m[1]));
      const silEnds   = Array.from(logText.matchAll(/silence_end: ([\d.]+)/g)).map((m) => parseFloat(m[1]));
      const clipDur   = words.length ? words[words.length - 1].end + 0.5 : 60;
      const silences  = silStarts.map((s, i) => ({ start: s, end: silEnds[i] ?? clipDur }));

      const speechSegments: SpeechSegment[] = [];
      let cur = 0;
      for (const sil of silences) {
        if (sil.start > cur + 0.15) speechSegments.push({ start: Math.round(cur * 100) / 100, end: Math.round(sil.start * 100) / 100 });
        cur = sil.end;
      }
      if (cur < clipDur - 0.15) speechSegments.push({ start: Math.round(cur * 100) / 100, end: Math.round(clipDur * 100) / 100 });
      if (silences.length === 0) speechSegments.push({ start: 0, end: Math.round(clipDur * 100) / 100 });

      const updatedClips = clips.map((c) =>
        c.id === clip.id ? { ...c, transcribed: true, transcription: words, speechSegments } : c
      );
      setClips(updatedClips);
      await saveClips(updatedClips);

      try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile(audioName); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setTranscribingId(null);
    }
  }

  // ── Transcribe all ─────────────────────────────────────────
  async function handleTranscribeAll() {
    for (const clip of clips.filter((c) => !c.transcribed)) {
      await handleTranscribeClip(clip);
    }
  }

  // ── Match script to clips ──────────────────────────────────
  async function handleMatch() {
    setMatching(true);
    setError(null);
    try {
      const newSegments = matchScriptToClips(script, clips);
      setSegments(newSegments);
      await fetch(`/api/editor/script/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: newSegments, status: 'ready' }),
      });
      setProject((p) => p ? { ...p, status: 'ready' } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Matching failed');
    } finally {
      setMatching(false);
    }
  }

  // ── Add a clip segment to a script line ────────────────────
  async function handleAddSegmentClip(segId: string, clip: ScriptClip, spStart: number, spEnd: number) {
    const seg = segments.find(s => s.id === segId);
    const { start, end } = seg
      ? narrowToScriptLine(seg.scriptLine, clip, spStart, spEnd)
      : { start: spStart, end: spEnd };
    const newEntry: SegmentClip = { clipId: clip.id, clipName: clip.name, start, end };
    const updated = segments.map((s) =>
      s.id === segId ? { ...s, clips: [...s.clips, newEntry], confidence: 1 } : s
    );
    setSegments(updated);
    await saveSegments(updated);
    // Keep picker open so user can add more
  }

  // ── Remove one clip from a script line ─────────────────────
  async function handleRemoveSegmentClip(segId: string, clipIndex: number) {
    const updated = segments.map((s) => {
      if (s.id !== segId) return s;
      const remaining = s.clips.filter((_, i) => i !== clipIndex);
      return { ...s, clips: remaining, confidence: remaining.length ? s.confidence : 0 };
    });
    setSegments(updated);
    await saveSegments(updated);
  }

  // ── Preview a speech segment ───────────────────────────────
  async function handlePreview(clip: ScriptClip, sp: SpeechSegment, key: string) {
    const video = previewRef.current;
    if (!video) return;

    if (previewKey === key) {
      video.pause();
      setPreviewKey(null);
      return;
    }

    let url = clip.videoUrl ?? null;
    if (!url) url = await getFreshClipUrl(clip.id);
    if (!url) return;

    previewEndRef.current = sp.end;
    if (video.src !== url) video.src = url;
    video.currentTime = sp.start;
    setPreviewKey(key);
    try { await video.play(); } catch { /* autoplay blocked */ }
  }

  // ── Script auto-save ───────────────────────────────────────
  function handleScriptChange(value: string) {
    setScript(value);
    if (scriptSaveTimeout.current) clearTimeout(scriptSaveTimeout.current);
    scriptSaveTimeout.current = setTimeout(() => {
      fetch(`/api/editor/script/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: value }),
      });
    }, 800);
  }

  // ── Bring assembled segments to the timeline editor ───────
  async function handleBringToEditor() {
    if (!validSegmentCount) return;
    setBringing(true);
    setError(null);
    try {
      const tlSegments = segments
        .filter(s => s.clips.length > 0)
        .map(s => {
          const first = s.clips[0];
          const last = s.clips[s.clips.length - 1];
          const firstSrc = clips.find(c => c.id === first.clipId);
          const lastSrc = clips.find(c => c.id === last.clipId);
          return {
          id: s.id,
          scriptLine: s.scriptLine,
          trimStart: edgeTrim(firstSrc, first.start, first.end, 'start'),
          trimEnd: edgeTrim(lastSrc, last.start, last.end, 'end'),
          title: '',
          volume: 1,
          clips: s.clips.map(sc => {
            const src = clips.find(c => c.id === sc.clipId);
            return {
              clipId: sc.clipId,
              clipName: sc.clipName,
              clipPath: src?.path ?? '',
              start: sc.start,
              end: sc.end,
              transcription: src?.transcription ?? [],
            };
          }),
          };
        });

      const res = await fetch('/api/editor/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${project?.title ?? 'Untitled'} — Edit`,
          source_project_id: params.id,
          segments: tlSegments,
        }),
      });
      const data = await safeJson(res);
      if (data.error) throw new Error(data.error as string);
      router.push(`/editor/timeline/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open editor');
      setBringing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
        <div className="h-8 w-64 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-2 bg-zinc-900 rounded-xl h-80 animate-pulse" />
          <div className="col-span-3 bg-zinc-900 rounded-xl h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const hasTranscribed = clips.some((c) => c.transcribed);
  const hasUntranscribed = clips.some((c) => !c.transcribed);
  const isTranscribing = transcribingId !== null;
  const scriptLines = script.split('\n').filter((l) => l.trim()).length;
  const canMatch = script.trim().length > 0 && hasTranscribed && !matching;
  const validSegmentCount = segments.filter((s) => s.clips.length > 0).length;
  const totalAssembledDuration = segments
    .filter((s) => s.clips.length > 0)
    .reduce((sum, s) => sum + s.clips.reduce((cs, c) => cs + (c.end - c.start), 0), 0);

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
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          project.status === 'ready' ? 'bg-green-900/40 text-green-400'
          : project.status === 'error' ? 'bg-red-900/40 text-red-400'
          : 'bg-zinc-800 text-zinc-500'
        }`}>
          {project.status}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 2-column grid */}
      <div className="grid grid-cols-5 gap-6">
        {/* LEFT — Clips panel */}
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">Video Clips</p>
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={!!uploadMsg}
              className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Clips
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleUploadClips(e.target.files); e.target.value = ''; }}
            />
          </div>

          {uploadMsg && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {uploadMsg}
            </div>
          )}

          {clips.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-8 h-8 mx-auto mb-2 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-xs text-zinc-600">No clips yet — add video files above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {clips.map((clip) => (
                <div key={clip.id} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate" title={clip.name}>{clip.name}</p>
                      {clip.duration !== null && <p className="text-xs text-zinc-500 mt-0.5">{fmtTime(clip.duration)}</p>}
                    </div>
                    <button
                      onClick={() => handleDeleteClip(clip.id)}
                      disabled={isTranscribing}
                      className="text-zinc-600 hover:text-red-400 disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    {clip.transcribed ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Transcribed
                      </span>
                    ) : transcribingId === clip.id ? (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Transcribing...
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">Not transcribed</span>
                    )}
                    {!clip.transcribed && transcribingId !== clip.id && (
                      <button
                        onClick={() => handleTranscribeClip(clip)}
                        disabled={isTranscribing}
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white px-2.5 py-1 rounded-md transition-colors"
                      >
                        Transcribe
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasUntranscribed && (
            <button
              onClick={handleTranscribeAll}
              disabled={isTranscribing}
              className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {isTranscribing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Transcribing...
                </>
              ) : 'Transcribe All'}
            </button>
          )}
        </div>

        {/* RIGHT — Script panel */}
        <div className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-white">Script</p>
            <p className="text-xs text-zinc-500 mt-0.5">Each line will be matched to clip(s)</p>
          </div>

          <textarea
            value={script}
            onChange={(e) => handleScriptChange(e.target.value)}
            placeholder="Paste your script here..."
            className="flex-1 min-h-64 w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none transition-colors"
          />

          <p className="text-xs text-zinc-500">{scriptLines} {scriptLines === 1 ? 'line' : 'lines'}</p>

          <button
            onClick={handleMatch}
            disabled={!canMatch}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {matching ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Matching...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Match Script to Clips
              </>
            )}
          </button>
        </div>
      </div>

      {/* Segments section */}
      {segments.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Script Assembly</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {validSegmentCount}/{segments.length} lines matched &middot; Total: {fmtTime(totalAssembledDuration)}
            </p>
          </div>

          <div className="space-y-2">
            {segments.map((seg, i) => {
              const hasMatch = seg.clips.length > 0;
              const isPicking = pickingForSegId === seg.id;
              const dots = 5;
              const filledDots = seg.confidence === 1 ? dots : Math.round(seg.confidence * dots);

              return (
                <div key={seg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {/* Main row */}
                  <div className="px-4 py-3 flex items-start gap-4">
                    <span className="text-xs text-zinc-600 w-5 text-right flex-shrink-0 mt-0.5">{i + 1}</span>

                    <p className="text-sm text-white flex-1 min-w-0 truncate mt-0.5" title={seg.scriptLine}>
                      {seg.scriptLine}
                    </p>

                    <svg className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>

                    {/* Assigned clip chips */}
                    <div className="flex flex-wrap gap-1.5 flex-shrink-0 max-w-xs">
                      {hasMatch ? (
                        seg.clips.map((sc, ci) => (
                          <span
                            key={ci}
                            className="flex items-center gap-1 text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-md"
                          >
                            <span className="text-zinc-500 truncate max-w-[5rem]" title={sc.clipName}>
                              {sc.clipName.split('.')[0]}
                            </span>
                            <span className="text-zinc-600">{fmtTime(sc.start)}–{fmtTime(sc.end)}</span>
                            <button
                              onClick={() => handleRemoveSegmentClip(seg.id, ci)}
                              className="text-zinc-600 hover:text-red-400 transition-colors ml-0.5 leading-none"
                              title="Remove"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          No match
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                      {Array.from({ length: dots }).map((_, d) => (
                        <div key={d} className={`w-1.5 h-1.5 rounded-full ${d < filledDots ? 'bg-purple-500' : 'bg-zinc-700'}`} />
                      ))}
                    </div>

                    <button
                      onClick={() => setPickingForSegId(isPicking ? null : seg.id)}
                      className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-md transition-colors ${
                        isPicking
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {isPicking ? 'Done' : hasMatch ? '+ Add' : 'Pick'}
                    </button>
                  </div>

                  {/* Manual picker */}
                  {isPicking && (
                    <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
                      <p className="text-xs text-zinc-500 mb-2">
                        Add a speech segment — picked clips play in order for this line:
                      </p>
                      {clips.filter((c) => c.transcribed && c.speechSegments?.length > 0).length === 0 ? (
                        <p className="text-xs text-zinc-600">No speech segments detected yet — transcribe a clip first.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {clips.filter((c) => c.transcribed).map((clip) =>
                            (clip.speechSegments ?? []).map((sp, si) => {
                              const pk = `${clip.id}-${si}`;
                              const isPlaying = previewKey === pk;
                              return (
                                <div
                                  key={pk}
                                  className="flex items-center rounded-lg overflow-hidden border border-zinc-700 hover:border-zinc-600 transition-colors"
                                >
                                  <button
                                    onClick={() => handlePreview(clip, sp, pk)}
                                    title={isPlaying ? 'Pause' : 'Preview'}
                                    className={`text-xs px-2.5 py-1.5 transition-colors ${
                                      isPlaying
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'
                                    }`}
                                  >
                                    {isPlaying ? '⏸' : '▶'}
                                  </button>
                                  <button
                                    onClick={() => handleAddSegmentClip(seg.id, clip, sp.start, sp.end)}
                                    className="text-xs bg-zinc-800 hover:bg-purple-700 text-zinc-300 hover:text-white px-3 py-1.5 transition-colors whitespace-nowrap border-l border-zinc-700"
                                  >
                                    <span className="text-zinc-500 mr-1">{clip.name.split('.')[0]}</span>
                                    {fmtTime(sp.start)}–{fmtTime(sp.end)}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bring to Editor */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <button
              onClick={handleBringToEditor}
              disabled={bringing || validSegmentCount === 0}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {bringing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Opening editor…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Bring to Editor
                </>
              )}
            </button>
            <p className="text-xs text-zinc-600 text-center">
              Add captions, reorder segments, trim, and adjust volume
            </p>
          </div>
        </div>
      )}

      {/* Hidden video element for segment previews */}
      <video
        ref={previewRef}
        style={{ display: 'none' }}
        onTimeUpdate={() => {
          const v = previewRef.current;
          if (v && v.currentTime >= previewEndRef.current) { v.pause(); setPreviewKey(null); }
        }}
        onEnded={() => setPreviewKey(null)}
      />
    </div>
  );
}
