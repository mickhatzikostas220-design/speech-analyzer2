'use client';

import React from 'react';
import { AbsoluteFill, Series, Video, Sequence } from 'remotion';

export interface CompositionClip {
  videoUrl: string;
  startFrame: number;
  durationFrames: number;
}

export interface CompositionSegment {
  clips: CompositionClip[];
  title: string;
  volume: number;
  startFrame: number;
}

export interface CompositionCaption {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface TimelineCompositionProps {
  segments: CompositionSegment[];
  captions: CompositionCaption[];
}

export const TimelineComposition: React.FC<TimelineCompositionProps> = ({ segments, captions }) => {
  // Flatten to a sequence of playable clip pieces
  const pieces: { url: string; startFrame: number; durationFrames: number; volume: number }[] = [];
  for (const seg of segments) {
    for (const clip of seg.clips) {
      if (clip.durationFrames > 0 && clip.videoUrl) {
        pieces.push({
          url: clip.videoUrl,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          volume: Math.min(1, seg.volume), // browser caps at 1; >1 only applied in ffmpeg export
        });
      }
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video clips in sequence */}
      <Series>
        {pieces.map((piece, i) => (
          <Series.Sequence key={i} durationInFrames={piece.durationFrames}>
            <AbsoluteFill>
              <Video
                src={piece.url}
                startFrom={piece.startFrame}
                volume={piece.volume}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>

      {/* Captions — bottom centre */}
      {captions.map((cap, i) => {
        const dur = cap.endFrame - cap.startFrame;
        if (dur <= 0 || !cap.text.trim()) return null;
        return (
          <Sequence key={`cap-${i}`} from={cap.startFrame} durationInFrames={dur}>
            <AbsoluteFill
              style={{
                justifyContent: 'flex-end',
                alignItems: 'center',
                paddingBottom: 56,
                paddingLeft: 48,
                paddingRight: 48,
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(0,0,0,0.78)',
                  color: 'white',
                  fontSize: 36,
                  lineHeight: 1.35,
                  padding: '12px 24px',
                  borderRadius: 10,
                  textAlign: 'center',
                  maxWidth: '80%',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {cap.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Title overlays — top centre, one per segment */}
      {segments.map((seg, si) => {
        if (!seg.title.trim()) return null;
        const dur = seg.clips.reduce((s, c) => s + c.durationFrames, 0);
        if (dur <= 0) return null;
        return (
          <Sequence key={`title-${si}`} from={seg.startFrame} durationInFrames={dur}>
            <AbsoluteFill
              style={{
                justifyContent: 'flex-start',
                alignItems: 'center',
                paddingTop: 48,
              }}
            >
              <div
                style={{
                  backgroundColor: 'rgba(0,0,0,0.70)',
                  color: 'white',
                  fontSize: 42,
                  fontWeight: 700,
                  padding: '14px 28px',
                  borderRadius: 12,
                  textAlign: 'center',
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                {seg.title}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
