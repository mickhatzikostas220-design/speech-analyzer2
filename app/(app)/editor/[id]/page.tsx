'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface EditorClip {
  id: string;
  start: number;
  end: number;
  selected: boolean;
}

interface EditorProject {
  id: string;
  title: string;
  video_path: string | null;
  video_name: string | null;
  video_duration: number | null;
  status: 'empty' | 'ready' | 'error';
  clips: EditorClip[];
  video_url?: string | null;
}

async function safeJson(res: Response) {
  try {
    const text = (await res.text()).trim();
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: `Server error ${res.status}` };
  }
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

function fmtShort(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Upload zone ──────────────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragging ? 'border-purple-500 bg-purple-950/30' : 'border-zinc-700 hover:border-zinc-500'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <svg className="w-8 h-8 mx-auto mb-2 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p className="text-sm text-zinc-400">Drop a video file or click to browse</p>
      <p className="text-xs text-zinc-600 mt-1">MP4, MOV, WebM, AVI, MKV</p>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────
function Timeline({
  clips,
  duration,
  onToggle,
  currentTime,
}: {
  clips: EditorClip[];
  duration: number;
  onToggle: (id: string) => void;
  currentTime: number;
}) {
  if (!duration) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">Timeline — click a segment to toggle</span>
        <span className="text-xs text-zinc-600">{fmtShort(duration)}</span>
      </div>
      <div className="relative h-10 bg-zinc-800 rounded-lg overflow-hidden">
        {clips.map((clip) => {
          const left = (clip.start / duration) * 100;
          const width = ((clip.end - clip.start) / duration) * 100;
          return (
            <button
              key={clip.id}
              title={`${fmt(clip.start)} – ${fmt(clip.end)}`}
              onClick={() => onToggle(clip.id)}
              style={{ left: `${left}%`, width: `${width}%` }}
              className={`absolute top-0 h-full border-r border-zinc-900 transition-colors ${
                clip.selected ? 'bg-purple-600 hover:bg-purple-500' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            />
          );
        })}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/60 pointer-events-none"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-700">
        <span>0:00</span>
        <span>{fmtShort(duration / 2)}</span>
        <span>{fmtShort(duration)}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function EditorProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffmpegRef = useRef<any>(null);
  const videoInFFmpeg = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [project, setProject] = useState<EditorProject | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<EditorClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Load project
  useEffect(() => {
    fetch(`/api/editor/${params.id}`)
      .then(safeJson)
      .then((d) => {
        if (d.error) { router.push('/editor'); return; }
        setProject(d as EditorProject);
        setClips((d as EditorProject).clips ?? []);
        if ((d as EditorProject).video_url) setVideoUrl((d as EditorProject).video_url!);
        setLoading(false);
      })
      .catch(() => router.push('/editor'));
  }, [params.id, router]);

  // Save duration once video metadata loads
  function handleVideoMetadata() {
    const dur = videoRef.current?.duration;
    if (dur && project && !project.video_duration) {
      fetch(`/api/editor/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_duration: dur }),
      })
        .then(safeJson)
        .then((d) => setProject((p) => p ? { ...p, video_duration: (d as EditorProject).video_duration } : p));
    }
  }

  // Lazy-load ffmpeg.wasm
  async function getFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    setProcessingMsg('Loading audio engine (one-time ~10 MB download)…');
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

  // Get fresh signed URL before any ffmpeg operation
  async function getFreshVideoUrl(): Promise<string | null> {
    const res = await fetch(`/api/editor/${params.id}`);
    const d = await safeJson(res);
    const url = (d as EditorProject).video_url ?? null;
    if (url) setVideoUrl(url);
    return url;
  }

  // Upload directly to Supabase Storage
  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    videoInFFmpeg.current = false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() || 'mp4';
      const path = `${user.id}/editor/${params.id}/original.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('speeches')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) throw new Error(uploadErr.message);

      // Get signed URL for immediate playback
      const { data: signed } = await supabase.storage
        .from('speeches')
        .createSignedUrl(path, 3600);

      // Save metadata
      const res = await fetch(`/api/editor/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: path, video_name: file.name, status: 'empty', clips: [] }),
      });
      const updated = await safeJson(res);
      setProject(updated as EditorProject);
      setClips([]);
      if (signed?.signedUrl) setVideoUrl(signed.signedUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // Detect silences with ffmpeg.wasm
  async function detectSilences() {
    setProcessing(true);
    setError(null);
    try {
      const url = await getFreshVideoUrl();
      if (!url) throw new Error('No video found');

      const ffmpeg = await getFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');

      if (!videoInFFmpeg.current) {
        setProcessingMsg('Downloading video…');
        await ffmpeg.writeFile('input.mp4', await fetchFile(url));
        videoInFFmpeg.current = true;
      }

      setProcessingMsg('Detecting silences…');
      const logs: string[] = [];
      const logHandler = ({ message }: { message: string }) => logs.push(message);
      ffmpeg.on('log', logHandler);

      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-af', 'silencedetect=noise=-30dB:d=0.5',
        '-f', 'null', '-',
      ]);

      ffmpeg.off('log', logHandler);

      const logText = logs.join('\n');
      const starts = Array.from(logText.matchAll(/silence_start: ([\d.]+)/g)).map((m) => parseFloat(m[1]));
      const ends = Array.from(logText.matchAll(/silence_end: ([\d.]+)/g)).map((m) => parseFloat(m[1]));

      const duration = project?.video_duration ?? videoRef.current?.duration ?? 0;
      const silences = starts.map((s, i) => ({ start: s, end: ends[i] ?? duration }));

      // Invert silences → speech segments
      const speech: { start: number; end: number }[] = [];
      let cursor = 0;
      for (const sil of silences) {
        if (sil.start > cursor + 0.1) speech.push({ start: cursor, end: sil.start });
        cursor = sil.end;
      }
      if (cursor < duration - 0.1) speech.push({ start: cursor, end: duration });
      if (silences.length === 0) speech.push({ start: 0, end: duration });

      const newClips: EditorClip[] = speech.map((seg) => ({
        id: crypto.randomUUID(),
        start: Math.round(seg.start * 100) / 100,
        end: Math.round(seg.end * 100) / 100,
        selected: true,
      }));

      setClips(newClips);
      setProject((p) => p ? { ...p, status: 'ready', clips: newClips } : p);

      await fetch(`/api/editor/${params.id}/clips`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: newClips }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed');
    } finally {
      setProcessing(false);
      setProcessingMsg('');
    }
  }

  // Export selected clips with ffmpeg.wasm
  async function exportVideo() {
    const selected = clips.filter((c) => c.selected);
    if (!selected.length) return;
    setExporting(true);
    setExportProgress(0);
    setError(null);

    try {
      const url = await getFreshVideoUrl();
      if (!url) throw new Error('No video found');

      const ffmpeg = await getFFmpeg();
      const { fetchFile } = await import('@ffmpeg/util');

      const progressHandler = ({ progress }: { progress: number }) =>
        setExportProgress(Math.round(Math.min(progress, 1) * 100));
      ffmpeg.on('progress', progressHandler);

      if (!videoInFFmpeg.current) {
        setProcessingMsg('Downloading video…');
        await ffmpeg.writeFile('input.mp4', await fetchFile(url));
        videoInFFmpeg.current = true;
      }

      setProcessingMsg('');

      if (selected.length === 1) {
        const { start, end } = selected[0];
        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-ss', String(start), '-to', String(end),
          '-c', 'copy', 'output.mp4',
        ]);
      } else {
        const vf = selected.map((s, i) =>
          `[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`
        );
        const af = selected.map((s, i) =>
          `[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`
        );
        const inputs = selected.map((_, i) => `[v${i}][a${i}]`).join('');
        const fc = [...vf, ...af, `${inputs}concat=n=${selected.length}:v=1:a=1[outv][outa]`].join(';');

        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-filter_complex', fc,
          '-map', '[outv]', '-map', '[outa]',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '192k',
          'output.mp4',
        ]);
      }

      ffmpeg.off('progress', progressHandler);

      const raw = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([new Uint8Array(raw as ArrayBuffer)], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const safeName = (project?.title ?? 'export').replace(/[^a-z0-9]/gi, '_');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${safeName}_edited.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      await ffmpeg.deleteFile('output.mp4');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress(0);
      setProcessingMsg('');
    }
  }

  // Debounced clip save
  const saveClips = useCallback((updated: EditorClip[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch(`/api/editor/${params.id}/clips`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: updated }),
      });
    }, 600);
  }, [params.id]);

  function toggleClip(id: string) {
    setClips((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, selected: !c.selected } : c);
      saveClips(updated);
      return updated;
    });
  }

  function selectAll(selected: boolean) {
    setClips((prev) => {
      const updated = prev.map((c) => ({ ...c, selected }));
      saveClips(updated);
      return updated;
    });
  }

  // ── Render ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 aspect-video bg-zinc-900 rounded-xl animate-pulse" />
          <div className="col-span-2 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-zinc-900 rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const selectedCount = clips.filter((c) => c.selected).length;
  const selectedDuration = clips.filter((c) => c.selected).reduce((s, c) => s + (c.end - c.start), 0);
  const duration = project.video_duration ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/editor')} className="text-zinc-500 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-white">{project.title}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          project.status === 'ready' ? 'bg-green-900/40 text-green-400' :
          project.status === 'error' ? 'bg-red-900/40 text-red-400' :
          'bg-zinc-800 text-zinc-500'
        }`}>
          {project.status}
        </span>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-5 gap-6">
        {/* Video player */}
        <div className="col-span-3 space-y-4">
          <div className="bg-zinc-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-full"
                onLoadedMetadata={handleVideoMetadata}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
              />
            ) : (
              <div className="text-center text-zinc-600">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">No video uploaded</p>
              </div>
            )}
          </div>

          {clips.length > 0 && duration > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Timeline clips={clips} duration={duration} onToggle={toggleClip} currentTime={currentTime} />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="col-span-2 space-y-4">
          {/* Upload */}
          {!project.video_path ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-white">Upload Video</p>
              {uploading ? (
                <div className="flex items-center gap-3 py-4">
                  <svg className="w-5 h-5 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-sm text-zinc-400">Uploading…</span>
                </div>
              ) : (
                <UploadZone onFile={handleUpload} />
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500">Source file</p>
              <p className="text-sm text-white truncate">{project.video_name}</p>
              {duration > 0 && <p className="text-xs text-zinc-500">Duration: {fmtShort(duration)}</p>}
              <button
                onClick={() => {
                  videoInFFmpeg.current = false;
                  setProject((p) => p ? { ...p, video_path: null, video_name: null, video_duration: null, status: 'empty', clips: [] } : p);
                  setClips([]);
                  setVideoUrl(null);
                }}
                className="text-xs text-zinc-600 hover:text-red-400 transition-colors mt-1"
              >
                Replace video
              </button>
            </div>
          )}

          {/* Process */}
          {project.video_path && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-white">Detect Silences</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Finds speech segments by removing silent gaps.
                  {!ffmpegRef.current && ' First run downloads ~10 MB.'}
                </p>
              </div>
              {processingMsg && !exporting && (
                <p className="text-xs text-amber-400">{processingMsg}</p>
              )}
              <button
                onClick={detectSilences}
                disabled={processing || exporting}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                {processing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Analysing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    {clips.length > 0 ? 'Re-detect Silences' : 'Detect Silences'}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Export */}
          {clips.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">
                  {selectedCount}/{clips.length} clips selected
                </p>
                <div className="flex gap-2">
                  <button onClick={() => selectAll(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">All</button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={() => selectAll(false)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">None</button>
                </div>
              </div>
              {selectedCount > 0 && (
                <p className="text-xs text-zinc-500">Output: ~{fmtShort(selectedDuration)}</p>
              )}

              {exporting && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 text-center">{processingMsg || `${exportProgress}%`}</p>
                </div>
              )}

              <button
                onClick={exportVideo}
                disabled={exporting || processing || selectedCount === 0}
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
                    Export &amp; Download
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Clip list */}
      {clips.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-medium text-white">Speech Segments</p>
          </div>
          <div className="divide-y divide-zinc-800">
            {clips.map((clip, i) => (
              <div
                key={clip.id}
                className={`flex items-center gap-4 px-4 py-3 ${clip.selected ? 'bg-zinc-900' : 'bg-zinc-950/50'}`}
              >
                <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>

                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = clip.start;
                      videoRef.current.play();
                    }
                  }}
                  className="text-zinc-500 hover:text-purple-400 transition-colors"
                  title="Preview"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white tabular-nums">
                      {fmt(clip.start)} – {fmt(clip.end)}
                    </span>
                    <span className="text-xs text-zinc-500">{(clip.end - clip.start).toFixed(1)}s</span>
                  </div>
                  {duration > 0 && (
                    <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden max-w-xs">
                      <div
                        className={`h-full rounded-full ${clip.selected ? 'bg-purple-600' : 'bg-zinc-600'}`}
                        style={{ width: `${((clip.end - clip.start) / duration) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleClip(clip.id)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    clip.selected
                      ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-900/80'
                      : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                  }`}
                >
                  {clip.selected ? (
                    <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Include</>
                  ) : (
                    <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>Skip</>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
