'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface EditorClip {
  id: string;
  start: number;
  end: number;
  selected: boolean;
}

interface EditorProject {
  id: string;
  title: string;
  videoName: string | null;
  videoExt: string | null;
  videoDuration: number | null;
  status: 'empty' | 'processing' | 'ready' | 'error';
  clips: EditorClip[];
  exportReady: boolean;
  error?: string;
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

// ── Upload zone ─────────────────────────────────────────────
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

// ── Timeline bar ─────────────────────────────────────────────
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

  const playheadPct = (currentTime / duration) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">Timeline</span>
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
              className={`absolute top-0 h-full transition-colors border-r border-zinc-900 ${
                clip.selected
                  ? 'bg-purple-600 hover:bg-purple-500'
                  : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            />
          );
        })}
        {/* playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/60 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
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

// ── Main page ────────────────────────────────────────────────
export default function EditorProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [project, setProject] = useState<EditorProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [clips, setClips] = useState<EditorClip[]>([]);

  // Load project
  useEffect(() => {
    fetch(`/api/editor/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { router.push('/editor'); return; }
        setProject(d);
        setClips(d.clips ?? []);
        setLoading(false);
      })
      .catch(() => { router.push('/editor'); });
  }, [params.id, router]);

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
    setProject((p) => p ? { ...p, exportReady: false } : p);
  }

  function selectAll(selected: boolean) {
    setClips((prev) => {
      const updated = prev.map((c) => ({ ...c, selected }));
      saveClips(updated);
      return updated;
    });
    setProject((p) => p ? { ...p, exportReady: false } : p);
  }

  async function handleUpload(file: File) {
    if (!project) return;
    setUploading(true);
    setUploadPct(0);
    setError(null);

    const formData = new FormData();
    formData.append('video', file);

    // Use XMLHttpRequest so we get progress events
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/editor/${params.id}/upload`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 200) resolve();
        else reject(new Error('Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    }).catch((e) => setError(e.message));

    // Re-fetch project
    const res = await fetch(`/api/editor/${params.id}`);
    const updated = await res.json();
    setProject(updated);
    setClips(updated.clips ?? []);
    setUploading(false);
  }

  async function processVideo() {
    if (!project) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/${params.id}/process`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');
      const updated = data.clips as EditorClip[];
      setClips(updated);
      setProject((p) => p ? { ...p, status: 'ready', clips: updated, exportReady: false } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed');
      setProject((p) => p ? { ...p, status: 'error' } : p);
    } finally {
      setProcessing(false);
    }
  }

  async function exportVideo() {
    if (!project) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/editor/${params.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ clips }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setProject((p) => p ? { ...p, exportReady: true } : p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function downloadExport() {
    const a = document.createElement('a');
    a.href = `/api/editor/${params.id}/export`;
    a.click();
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse mb-8" />
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-3 aspect-video bg-zinc-900 rounded-xl animate-pulse" />
          <div className="col-span-2 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const selectedCount = clips.filter((c) => c.selected).length;
  const selectedDuration = clips
    .filter((c) => c.selected)
    .reduce((sum, c) => sum + (c.end - c.start), 0);

  const videoSrc = project.videoExt ? `/api/editor/${params.id}/video` : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
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
          project.status === 'ready' ? 'bg-green-900/40 text-green-400' :
          project.status === 'processing' ? 'bg-amber-900/40 text-amber-400' :
          project.status === 'error' ? 'bg-red-900/40 text-red-400' :
          'bg-zinc-800 text-zinc-500'
        }`}>
          {project.status === 'processing' ? 'processing…' : project.status}
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
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className="w-full h-full"
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

          {/* Timeline */}
          {clips.length > 0 && project.videoDuration && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Timeline
                clips={clips}
                duration={project.videoDuration}
                onToggle={toggleClip}
                currentTime={currentTime}
              />
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div className="col-span-2 space-y-4">
          {/* Upload */}
          {!project.videoExt ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-white">Upload Video</p>
              {uploading ? (
                <div className="space-y-2">
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 text-center">{uploadPct}% uploaded</p>
                </div>
              ) : (
                <UploadZone onFile={handleUpload} />
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
              <p className="text-xs text-zinc-500">Source file</p>
              <p className="text-sm text-white truncate">{project.videoName}</p>
              {project.videoDuration && (
                <p className="text-xs text-zinc-500">
                  Duration: {fmtShort(project.videoDuration)}
                </p>
              )}
              <button
                onClick={() => setProject((p) => p ? { ...p, videoExt: null } : p)}
                className="text-xs text-zinc-600 hover:text-red-400 transition-colors mt-1"
              >
                Replace video
              </button>
            </div>
          )}

          {/* Process */}
          {project.videoExt && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-white">Detect Silences</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Finds speech segments by removing silent gaps.
                </p>
              </div>
              <button
                onClick={processVideo}
                disabled={processing || project.status === 'processing'}
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

          {/* Clip summary + export */}
          {clips.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">
                  {selectedCount}/{clips.length} clips selected
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => selectAll(true)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    All
                  </button>
                  <span className="text-zinc-700">·</span>
                  <button
                    onClick={() => selectAll(false)}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    None
                  </button>
                </div>
              </div>

              {selectedCount > 0 && (
                <p className="text-xs text-zinc-500">
                  Output: ~{fmtShort(selectedDuration)}
                </p>
              )}

              <button
                onClick={exportVideo}
                disabled={exporting || selectedCount === 0}
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
                    Export Video
                  </>
                )}
              </button>

              {project.exportReady && (
                <button
                  onClick={downloadExport}
                  className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Download .mp4
                </button>
              )}
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
                className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                  clip.selected ? 'bg-zinc-900' : 'bg-zinc-950/50'
                }`}
              >
                <span className="text-xs text-zinc-600 w-5 text-right">{i + 1}</span>

                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = clip.start;
                      videoRef.current.play();
                    }
                  }}
                  className="text-zinc-500 hover:text-purple-400 transition-colors flex-shrink-0"
                  title="Jump to segment"
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
                    <span className="text-xs text-zinc-500">
                      {(clip.end - clip.start).toFixed(1)}s
                    </span>
                  </div>
                  {/* Mini duration bar */}
                  <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden w-full max-w-xs">
                    <div
                      className={`h-full rounded-full ${clip.selected ? 'bg-purple-600' : 'bg-zinc-600'}`}
                      style={{
                        width: project.videoDuration
                          ? `${((clip.end - clip.start) / project.videoDuration) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => toggleClip(clip.id)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                    clip.selected
                      ? 'bg-purple-900/50 text-purple-300 hover:bg-purple-900/80'
                      : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
                  }`}
                >
                  {clip.selected ? (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Include
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Skip
                    </>
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
