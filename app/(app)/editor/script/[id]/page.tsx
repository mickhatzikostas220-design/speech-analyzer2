'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface WordTimestamp {
  word: string;
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
  videoUrl?: string | null;
}

interface ScriptSegment {
  id: string;
  scriptLine: string;
  clipId: string | null;
  clipName: string | null;
  start: number;
  end: number;
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

// ── Script matching algorithm ────────────────────────────────
function normalizeWord(w: string) {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function seqScore(scriptWords: string[], windowWords: string[]): number {
  let si = 0;
  for (let wi = 0; wi < windowWords.length && si < scriptWords.length; wi++) {
    if (scriptWords[si] === windowWords[wi]) si++;
  }
  return si / scriptWords.length;
}

function matchScriptToClips(script: string, clips: ScriptClip[]): ScriptSegment[] {
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const scriptWords = line.split(/\s+/).map(normalizeWord).filter(Boolean);
    let bestScore = 0;
    let bestClipId: string | null = null;
    let bestClipName: string | null = null;
    let bestStart = 0;
    let bestEnd = 0;

    for (const clip of clips) {
      if (!clip.transcribed || !clip.transcription.length) continue;
      const trans = clip.transcription.map((w) => ({
        norm: normalizeWord(w.word),
        start: w.start,
        end: w.end,
      }));
      const minW = Math.max(1, Math.floor(scriptWords.length * 0.6));
      const maxW = Math.ceil(scriptWords.length * 1.6);
      for (let i = 0; i < trans.length; i++) {
        for (let sz = minW; sz <= maxW && i + sz <= trans.length; sz++) {
          const win = trans.slice(i, i + sz);
          const score = seqScore(scriptWords, win.map((w) => w.norm));
          if (score > bestScore) {
            bestScore = score;
            bestClipId = clip.id;
            bestClipName = clip.name;
            bestStart = Math.max(0, win[0].start - 0.15);
            bestEnd = win[win.length - 1].end + 0.15;
          }
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      scriptLine: line,
      clipId: bestClipId,
      clipName: bestClipName,
      start: bestStart,
      end: bestEnd,
      confidence: bestScore,
    };
  });
}

// ── Main page ────────────────────────────────────────────────
export default function ScriptEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);
  const scriptSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<ScriptProject | null>(null);
  const [clips, setClips] = useState<ScriptClip[]>([]);
  const [script, setScript] = useState('');
  const [segments, setSegments] = useState<ScriptSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
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
        setSegments(p.segments ?? []);
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);

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
    // Strip videoUrl before saving (it's ephemeral)
    const toSave = updated.map(({ videoUrl: _v, ...rest }) => rest);
    await fetch(`/api/editor/script/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips: toSave }),
    });
  }

  // ── Upload clips ───────────────────────────────────────────
  async function handleUploadClips(files: FileList) {
    setUploadMsg('Uploading...');
    setError(null);
    try {
      const newClips: ScriptClip[] = [...clips];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadMsg(`Uploading ${i + 1} of ${files.length}: ${file.name}`);

        // Get signed upload URL from server (bypasses storage RLS)
        const signRes = await fetch(`/api/editor/script/${params.id}/signed-upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name }),
        });
        const signData = await safeJson(signRes);
        if (signData.error) throw new Error(`Could not get upload URL: ${signData.error}`);

        const { token, path, clipId } = signData as { token: string; path: string; clipId: string };

        // Upload directly to Supabase using signed URL
        const { error: uploadErr } = await supabase.storage
          .from('speeches')
          .uploadToSignedUrl(path, token, file, { upsert: true });

        if (uploadErr) throw new Error(`Upload failed for ${file.name}: ${uploadErr.message}`);

        // Get a signed download URL for playback
        const { data: signed } = await supabase.storage
          .from('speeches')
          .createSignedUrl(path, 3600);

        const newClip: ScriptClip = {
          id: clipId,
          name: file.name,
          path,
          duration: null,
          transcribed: false,
          transcription: [],
          videoUrl: signed?.signedUrl ?? null,
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
      await ffmpeg.exec([
        '-i', inputName,
        '-vn',
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '32k',
        audioName,
      ]);

      const audioData = await ffmpeg.readFile(audioName);
      const audioBlob = new Blob([new Uint8Array(audioData as ArrayBuffer)], { type: 'audio/mpeg' });

      const form = new FormData();
      form.append('audio', audioBlob);

      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const data = await safeJson(res);
      if (data.error) throw new Error(data.error as string);

      const words: WordTimestamp[] = (data.words as WordTimestamp[]) ?? [];

      const updatedClips = clips.map((c) =>
        c.id === clip.id ? { ...c, transcribed: true, transcription: words } : c
      );
      setClips(updatedClips);
      await saveClips(updatedClips);

      // Cleanup ffmpeg FS
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
    const untranscribed = clips.filter((c) => !c.transcribed);
    for (const clip of untranscribed) {
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

  // ── Export assembled video ─────────────────────────────────
  async function handleExport() {
    const validSegments = segments.filter((s) => s.clipId && s.confidence > 0.1);
    if (!validSegments.length) return;

    setExporting(true);
    setExportProgress(0);
    setError(null);

    try {
      const ffmpeg = await getFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');

      const progressHandler = ({ progress }: { progress: number }) =>
        setExportProgress(Math.round(Math.min(progress, 1) * 100));
      ffmpeg.on('progress', progressHandler);

      // Download each unique clip
      const uniqueClipIds = Array.from(new Set(validSegments.map((s) => s.clipId as string)));
      for (const clipId of uniqueClipIds) {
        const url = await getFreshClipUrl(clipId);
        if (!url) throw new Error(`Could not get URL for clip ${clipId}`);
        await ffmpeg.writeFile(`clip_${clipId}.mp4`, await fetchFile(url));
      }

      // Trim each segment
      for (let i = 0; i < validSegments.length; i++) {
        const seg = validSegments[i];
        await ffmpeg.exec([
          '-i', `clip_${seg.clipId}.mp4`,
          '-ss', String(seg.start),
          '-to', String(seg.end),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          `seg_${i}.mp4`,
        ]);
      }

      // Build concat list
      const concatContent = validSegments
        .map((_, i) => `file 'seg_${i}.mp4'`)
        .join('\n');
      const encoder = new TextEncoder();
      await ffmpeg.writeFile('concat.txt', encoder.encode(concatContent));

      // Concatenate
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        'output.mp4',
      ]);

      ffmpeg.off('progress', progressHandler);

      const raw = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([new Uint8Array(raw as ArrayBuffer)], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const safeName = (project?.title ?? 'export').replace(/[^a-z0-9]/gi, '_');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${safeName}_assembled.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      // Cleanup
      for (let i = 0; i < validSegments.length; i++) {
        try { await ffmpeg.deleteFile(`seg_${i}.mp4`); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('output.mp4'); } catch { /* ignore */ }
      try { await ffmpeg.deleteFile('concat.txt'); } catch { /* ignore */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress(0);
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
  const canMatch = script.trim().length > 0 && hasTranscribed && !matching && !exporting;
  const validSegmentCount = segments.filter((s) => s.clipId && s.confidence > 0.1).length;
  const totalAssembledDuration = segments
    .filter((s) => s.clipId && s.confidence > 0.1)
    .reduce((sum, s) => sum + (s.end - s.start), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/editor')}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">{project.title}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          project.status === 'ready'
            ? 'bg-green-900/40 text-green-400'
            : project.status === 'error'
            ? 'bg-red-900/40 text-red-400'
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
        {/* LEFT — Clips panel (2/5) */}
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
                      {clip.duration !== null && (
                        <p className="text-xs text-zinc-500 mt-0.5">{fmtTime(clip.duration)}</p>
                      )}
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
              ) : (
                'Transcribe All'
              )}
            </button>
          )}
        </div>

        {/* RIGHT — Script panel (3/5) */}
        <div className="col-span-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-white">Script</p>
            <p className="text-xs text-zinc-500 mt-0.5">Each line of text will be matched to a clip</p>
          </div>

          <textarea
            value={script}
            onChange={(e) => handleScriptChange(e.target.value)}
            placeholder="Paste your script here..."
            className="flex-1 min-h-64 w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 resize-none transition-colors"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{scriptLines} {scriptLines === 1 ? 'line' : 'lines'}</p>
          </div>

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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Script Assembly</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {validSegmentCount}/{segments.length} lines matched &middot; Total: {fmtTime(totalAssembledDuration)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {segments.map((seg, i) => {
              const hasMatch = seg.clipId && seg.confidence > 0.1;
              const dots = 5;
              const filledDots = Math.round(seg.confidence * dots);

              return (
                <div
                  key={seg.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-4"
                >
                  <span className="text-xs text-zinc-600 w-5 text-right flex-shrink-0">{i + 1}</span>

                  <p className="text-sm text-white truncate flex-1 min-w-0" title={seg.scriptLine}>
                    {seg.scriptLine}
                  </p>

                  <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>

                  {hasMatch ? (
                    <span className="text-xs text-zinc-300 flex-shrink-0 whitespace-nowrap">
                      {seg.clipName} &nbsp;
                      <span className="text-zinc-500">{fmtTime(seg.start)}–{fmtTime(seg.end)}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400 flex-shrink-0 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      No match found
                    </span>
                  )}

                  {/* Confidence dots */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {Array.from({ length: dots }).map((_, d) => (
                      <div
                        key={d}
                        className={`w-1.5 h-1.5 rounded-full ${
                          d < filledDots ? 'bg-purple-500' : 'bg-zinc-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Export section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            {exporting && (
              <div className="space-y-1">
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 text-center">{exportProgress}%</p>
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting || validSegmentCount === 0}
              className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {exporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export Assembled Video &darr;
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
