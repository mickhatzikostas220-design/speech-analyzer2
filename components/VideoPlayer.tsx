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
  if (severity === 'high') return 'border-[color:var(--danger)]';
  if (severity === 'medium') return 'border-[color:var(--score-mid)]';
  return 'border-[color:var(--accent-2)]';
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
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-surface-card">
      {/* Video */}
      {fileType === 'video' ? (
        <div className="relative aspect-video bg-black">
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={fileUrl}
            className="h-full w-full object-contain"
            preload="metadata"
          />

          {/* Feedback overlay — appears at top of video */}
          {activeFeedback && (
            <div
              key={activeFeedback.id}
              className={`feedback-overlay-enter absolute left-4 right-4 top-4 rounded-[var(--radius-md)] border-2 bg-[color:var(--ink-900)]/80 p-3 shadow-lg backdrop-blur-md ${severityGlow(activeFeedback.severity)}`}
            >
              <p className="text-sm font-medium leading-snug text-white">
                {activeFeedback.feedback_text}
              </p>
              <p className="mt-1 text-xs text-[color:var(--ink-300)]">
                → {activeFeedback.improvement_suggestion}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Audio — show waveform placeholder and feedback card */
        <div className="relative flex h-36 items-center justify-center bg-[var(--surface-sunk)]">
          <div className="flex h-16 items-end gap-0.5 px-4">
            {Array.from({ length: 80 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-sm"
                style={{
                  height: `${20 + Math.sin(i * 0.4) * 15 + Math.random() * 20}%`,
                  opacity: (i / 80) < (progress / 100) ? 1 : 0.5,
                  background: (i / 80) < (progress / 100) ? 'var(--signature)' : 'var(--ink-300)',
                }}
              />
            ))}
          </div>
          {activeFeedback && (
            <div
              key={activeFeedback.id}
              className={`feedback-overlay-enter absolute bottom-3 left-3 right-3 rounded-[var(--radius-md)] border-2 bg-[color:var(--ink-900)]/90 p-3 backdrop-blur-md ${severityGlow(activeFeedback.severity)}`}
            >
              <p className="text-xs font-medium text-white">{activeFeedback.feedback_text}</p>
              <p className="mt-0.5 text-xs text-[color:var(--ink-300)]">→ {activeFeedback.improvement_suggestion}</p>
            </div>
          )}
        </div>
      )}

      {fileType === 'audio' && (
        <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={fileUrl} preload="metadata" className="hidden" />
      )}

      {/* Controls */}
      <div className="space-y-2 px-4 pb-4 pt-3">
        {/* Progress bar */}
        <div
          className="group relative h-1.5 cursor-pointer rounded-full bg-[var(--ink-200)]"
          onClick={seek}
        >
          <div
            className="pointer-events-none h-full rounded-full bg-[var(--signature)] transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--ink-900)] opacity-0 shadow transition-opacity group-hover:opacity-100"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--signature)] transition-transform hover:scale-105"
          >
            {playing ? (
              <svg className="h-3.5 w-3.5" style={{ color: 'var(--on-signature)' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="ml-0.5 h-3.5 w-3.5" style={{ color: 'var(--on-signature)' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>

          <span className="text-xs tabular-nums text-muted">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
