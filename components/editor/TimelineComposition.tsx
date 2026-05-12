'use client';

import React from 'react';
import { AbsoluteFill, Series, OffthreadVideo, Sequence } from 'remotion';

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

export interface CompositionTextStyle {
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

export interface CompositionIntroTitle {
  text: string;
  durationInFrames: number;
}

export interface CompositionTextOverlay {
  id: string;
  text: string;
  startFrame: number;
  durationInFrames: number;
}

export interface TimelineCompositionProps {
  segments: CompositionSegment[];
  captions: CompositionCaption[];
  textStyle: CompositionTextStyle;
  introTitle: CompositionIntroTitle | null;
  textOverlays: CompositionTextOverlay[];
}

function hexToRgba(hex: string, opacity: number): string {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000';
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const CAPTION_POSITION: Record<'top' | 'center' | 'bottom', React.CSSProperties> = {
  top:    { justifyContent: 'flex-start', alignItems: 'center', paddingTop: 56 },
  center: { justifyContent: 'center',     alignItems: 'center' },
  bottom: { justifyContent: 'flex-end',   alignItems: 'center', paddingBottom: 56 },
};

export const TimelineComposition: React.FC<TimelineCompositionProps> = ({
  segments, captions, textStyle, introTitle, textOverlays,
}) => {
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

  const textBoxStyle: React.CSSProperties = {
    backgroundColor: hexToRgba(textStyle.bgColor, textStyle.bgOpacity),
    color: textStyle.color,
    fontSize: textStyle.fontSize,
    fontFamily: `'${textStyle.fontFamily}', system-ui, sans-serif`,
    fontWeight: textStyle.bold ? 700 : 400,
    fontStyle: textStyle.italic ? 'italic' : 'normal',
    textShadow: textStyle.shadow ? '2px 2px 8px rgba(0,0,0,0.9)' : 'none',
    lineHeight: 1.35,
    padding: '12px 24px',
    borderRadius: 10,
    textAlign: 'center' as const,
    maxWidth: '80%',
  };

  const captionPos = CAPTION_POSITION[textStyle.captionPosition] ?? CAPTION_POSITION.bottom;

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

      {/* Intro title — centered overlay at the start */}
      {introTitle && introTitle.durationInFrames > 0 && introTitle.text.trim() && (
        <Sequence from={0} durationInFrames={introTitle.durationInFrames}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingLeft: 48, paddingRight: 48 }}>
            <div style={{ ...textBoxStyle, fontSize: Math.round(textStyle.fontSize * 1.5), fontWeight: 700 }}>
              {introTitle.text}
            </div>
          </AbsoluteFill>
        </Sequence>
      )}

      {/* Captions */}
      {captions.map((cap, i) => {
        const dur = cap.endFrame - cap.startFrame;
        if (dur <= 0 || !cap.text.trim()) return null;
        return (
          <Sequence key={`cap-${i}`} from={cap.startFrame} durationInFrames={dur}>
            <AbsoluteFill style={{ ...captionPos, paddingLeft: 48, paddingRight: 48 }}>
              <div style={textBoxStyle}>{cap.text}</div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Text overlays — centered */}
      {textOverlays.map((ov) => {
        if (ov.durationInFrames <= 0 || !ov.text.trim()) return null;
        return (
          <Sequence key={`ov-${ov.id}`} from={ov.startFrame} durationInFrames={ov.durationInFrames}>
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingLeft: 48, paddingRight: 48 }}>
              <div style={textBoxStyle}>{ov.text}</div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Segment title overlays — always at top */}
      {segments.map((seg, si) => {
        if (!seg.title.trim()) return null;
        const dur = seg.clips.reduce((s, c) => s + c.durationFrames, 0);
        if (dur <= 0) return null;
        return (
          <Sequence key={`title-${si}`} from={seg.startFrame} durationInFrames={dur}>
            <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 48 }}>
              <div style={{ ...textBoxStyle, fontSize: Math.round(textStyle.fontSize * 1.1), fontWeight: 700, borderRadius: 12 }}>
                {seg.title}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}

    </AbsoluteFill>
  );
};
