'use client';

import React from 'react';
import { AbsoluteFill, Series, OffthreadVideo, Sequence, Img } from 'remotion';

export interface CompositionClip {
  videoUrl: string;
  startFrame: number;
  durationFrames: number;
}

export interface CompositionOverlay {
  url: string;
  x: number;     // percentage 0-100 of frame width
  y: number;     // percentage 0-100 of frame height
  width: number; // percentage 0-100 of frame width
  opacity: number; // 0-1
}

export interface CompositionSegment {
  clips: CompositionClip[];
  title: string;
  volume: number;
  startFrame: number;
  overlays?: CompositionOverlay[];
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
  const pieces: { url: string; startFrame: number; durationFrames: number; volume: number }[] = [];
  for (const seg of segments) {
    for (const clip of seg.clips) {
      if (clip.durationFrames > 0 && clip.videoUrl) {
        pieces.push({
          url: clip.videoUrl,
          startFrame: clip.startFrame,
          durationFrames: clip.durationFrames,
          volume: Math.min(1, seg.volume),
        });
      }
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {/* Video clips */}
      <Series>
        {pieces.map((piece, i) => (
          <Series.Sequence key={i} durationInFrames={piece.durationFrames}>
            <AbsoluteFill>
              <OffthreadVideo
                src={piece.url}
                startFrom={piece.startFrame}
                volume={piece.volume}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>

      {/* Image overlays per segment */}
      {segments.map((seg, si) => {
        if (!seg.overlays?.length) return null;
        const dur = seg.clips.reduce((s, c) => s + c.durationFrames, 0);
        if (dur <= 0) return null;
        return seg.overlays.map((ov, oi) => (
          <Sequence key={`ov-${si}-${oi}`} from={seg.startFrame} durationInFrames={dur}>
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
              <Img
                src={ov.url}
                style={{
                  position: 'absolute',
                  left: `${ov.x}%`,
                  top: `${ov.y}%`,
                  width: `${ov.width}%`,
                  opacity: ov.opacity,
                  objectFit: 'contain',
                }}
              />
            </AbsoluteFill>
          </Sequence>
        ));
      })}

      {/* Captions */}
      {captions.map((cap, i) => {
        const dur = cap.endFrame - cap.startFrame;
        if (dur <= 0 || !cap.text.trim()) return null;
        return (
          <Sequence key={`cap-${i}`} from={cap.startFrame} durationInFrames={dur}>
            <AbsoluteFill
              style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56, paddingLeft: 48, paddingRight: 48 }}
            >
              <div style={{ backgroundColor: 'rgba(0,0,0,0.78)', color: 'white', fontSize: 36, lineHeight: 1.35, padding: '12px 24px', borderRadius: 10, textAlign: 'center', maxWidth: '80%', fontFamily: 'system-ui, sans-serif' }}>
                {cap.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Title overlays */}
      {segments.map((seg, si) => {
        if (!seg.title.trim()) return null;
        const dur = seg.clips.reduce((s, c) => s + c.durationFrames, 0);
        if (dur <= 0) return null;
        return (
          <Sequence key={`title-${si}`} from={seg.startFrame} durationInFrames={dur}>
            <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 48 }}>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.70)', color: 'white', fontSize: 42, fontWeight: 700, padding: '14px 28px', borderRadius: 12, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
                {seg.title}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
