'use client';

import { useRef } from 'react';
import type { ROITimepoint } from '@/types';

interface Props {
  timeline: ROITimepoint[];
  durationMs: number;
  onSeek: (ms: number) => void;
  currentTimeMs: number;
}

const HEIGHT = 80;

const LINES = [
  { key: 'auditory'  as const, label: 'Auditory',  color: '#06b6d4' },
  { key: 'language'  as const, label: 'Language',  color: '#a855f7' },
  { key: 'attention' as const, label: 'Attention', color: '#22c55e' },
  { key: 'dmn'       as const, label: 'DMN',       color: '#f59e0b' },
];

export function ROIChart({ timeline, durationMs, onSeek, currentTimeMs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  if (timeline.length < 2) return null;

  const totalMs = durationMs || timeline[timeline.length - 1].timecode_ms + 1000;

  function xPct(ms: number) {
    return (ms / totalMs) * 100;
  }

  function yVal(v: number) {
    return HEIGHT - (v / 100) * HEIGHT;
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSeek(Math.round(((e.clientX - rect.left) / rect.width) * totalMs));
  }

  const currentX = xPct(currentTimeMs);

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full cursor-crosshair"
        style={{ height: HEIGHT }}
        onClick={handleClick}
      >
        {/* Grid line at 50 */}
        <line x1={0} y1={yVal(50)} x2={100} y2={yVal(50)}
          stroke="#3f3f46" strokeWidth="0.3" strokeDasharray="1,1" />

        {LINES.map(({ key, color }) => {
          const pts = timeline
            .map((t) => `${xPct(t.timecode_ms)},${yVal(t[key])}`)
            .join(' ');
          return (
            <polyline
              key={key}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.85"
            />
          );
        })}

        {/* Playhead */}
        <line x1={currentX} y1={0} x2={currentX} y2={HEIGHT}
          stroke="white" strokeWidth="0.5" opacity="0.4" />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {LINES.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ background: color }} />
            <span className="text-[11px] text-zinc-500">{label}</span>
          </div>
        ))}
        <span className="text-[11px] text-zinc-600 ml-auto">click to seek</span>
      </div>
    </div>
  );
}
