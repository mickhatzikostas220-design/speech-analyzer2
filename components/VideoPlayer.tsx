'use client';

import { useRef, useEffect, useState } from 'react';
import type { FeedbackPoint } from '@/types';

interface Props {
  fileUrl: string;
  fileType: 'video' | 'audio';
  activeFeedback: FeedbackPoint | undefined;
  onTimeUpdate: (ms: number) => void;
  seekToMs?: number;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function severityGlow(severity: string) {
  if (severity === 'high') return 'border-red-500/60 shadow-red-500/20';
  if (severity === 'medium') return 'border-amber-500/60 shadow-amber-500/20';
  return 'border-blue-500/60 shadow-blue-500/20';
}

export function VideoPlayer({ fileUrl, fileType, activeFeedback, onTimeUpdate, seekToMs }: Props) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const onTime = () => {
      setCurrentTime(el.currentTime);
      onTimeUpdate(Math.floor(el.currentTime * 1000));
    };
    const onDuration = () => setDuration(el.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);

    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [onTimeUpdate]);

  // Respond to external seek requests
  useEffect(() => {
    if (seekToMs !== undefined && mediaRef.current) {
      mediaRef.current.currentTime = seekToMs / 1000;
    }
  }, [seekToMs]);

  function togglePlay() {
    if (!mediaRef.current) return;
    playing ? mediaRef.current.pause() : mediaRef.current.play();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!mediaRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    mediaRef.current.currentTime = pct * duration;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Video */}
      {fileType === 'video' ? (
        <div className="relative bg-black aspect-video">
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={fileUrl}
            className="w-full h-full object-contain"
            preload="metadata"
          />

          {/* Feedback overlay — appears at top of video */}
          {activeFeedback && (
            <div
              key={activeFeedback.id}
              className={`absolute top-4 left-4 right-4 border rounded-xl p-3 backdrop-blur-md bg-zinc-950/80 shadow-lg feedback-overlay-enter ${severityGlow(activeFeedback.severity)}`}
            >
              <p className="text-white text-sm font-medium leading-snug">
                {activeFeedback.feedback_text}
              </p>
              <p className="text-zinc-400 text-xs mt-1">
                → {activeFeedback.improvement_suggestion}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Audio — show waveform placeholder and feedback card */
        <div className="relative bg-zinc-950 h-36 flex items-center justify-center">
          <div className="flex items-end gap-0.5 h-16 px-4">
            {Array.from({ length: 80 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-sm bg-zinc-800"
                style={{
                  height: `${20 + Math.sin(i * 0.4) * 15 + Math.random() * 20}%`,
                  opacity: (i / 80) < (progress / 100) ? 1 : 0.4,
                  background: (i / 80) < (progress / 100) ? '#a855f7' : undefined,
                }}
              />
            ))}
          </div>
          {activeFeedback && (
            <div
              key={activeFeedback.id}
              className={`absolute bottom-3 left-3 right-3 border rounded-xl p-3 backdrop-blur-md bg-zinc-950/90 feedback-overlay-enter ${severityGlow(activeFeedback.severity)}`}
            >
              <p className="text-white text-xs font-medium">{activeFeedback.feedback_text}</p>
              <p className="text-zinc-400 text-xs mt-0.5">→ {activeFeedback.improvement_suggestion}</p>
            </div>
          )}
        </div>
      )}

      {fileType === 'audio' && (
        <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={fileUrl} preload="metadata" className="hidden" />
      )}

      {/* Controls */}
      <div className="px-4 pb-4 pt-3 space-y-2">
        {/* Progress bar */}
        <div
          className="h-1 bg-zinc-800 rounded-full cursor-pointer relative group"
          onClick={seek}
        >
          <div
            className="h-full bg-purple-500 rounded-full pointer-events-none transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-zinc-200 transition-colors"
          >
            {playing ? (
              <svg className="w-3.5 h-3.5 text-zinc-950" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-zinc-950 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>

          <span className="text-xs text-zinc-500 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
