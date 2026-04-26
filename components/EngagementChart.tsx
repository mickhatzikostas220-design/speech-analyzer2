'use client';

import { useRef } from 'react';
import type { EngagementTimepoint, FeedbackPoint } from '@/types';

interface Props {
  timeline: EngagementTimepoint[];
  feedbackPoints: FeedbackPoint[];
  currentTimeMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}

const HEIGHT = 100;
const THRESHOLD = 55;

function scoreToY(score: number) {
  return HEIGHT - (score / 100) * HEIGHT;
}

function scoreColor(score: number) {
  if (score >= 70) return '#22c55e';
  if (score >= THRESHOLD) return '#f59e0b';
  return '#ef4444';
}

export function EngagementChart({ timeline, feedbackPoints, currentTimeMs, durationMs, onSeek }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  if (timeline.length < 2) return null;

  const totalMs = durationMs || timeline[timeline.length - 1].timecode_ms + 1000;

  function xPct(ms: number) {
    return (ms / totalMs) * 100;
  }

  // Build polyline points string
  const points = timeline
    .map((t) => `${xPct(t.timecode_ms)},${scoreToY(t.score)}`)
    .join(' ');

  // Build fill path (area under the line)
  const firstX = xPct(timeline[0].timecode_ms);
  const lastX = xPct(timeline[timeline.length - 1].timecode_ms);
  const fillPath = `M${firstX},${HEIGHT} L${points} L${lastX},${HEIGHT} Z`;

  const thresholdY = scoreToY(THRESHOLD);
  const currentX = xPct(currentTimeMs);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.round(pct * totalMs));
  }

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full cursor-crosshair"
        style={{ height: 100 }}
        onClick={handleClick}
      >
        {/* Threshold line */}
        <line
          x1={0} y1={thresholdY} x2={100} y2={thresholdY}
          stroke="#52525b" strokeWidth="0.4" strokeDasharray="1,1"
        />

        {/* Fill */}
        <path d={fillPath} fill="url(#engGrad)" opacity="0.25" />

        <defs>
          <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#a855f7"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Feedback point markers */}
        {feedbackPoints.map((fp) => (
          <line
            key={fp.id}
            x1={xPct(fp.timecode_ms)} y1={0}
            x2={xPct(fp.timecode_ms)} y2={HEIGHT}
            stroke={fp.severity === 'high' ? '#ef4444' : fp.severity === 'medium' ? '#f59e0b' : '#3b82f6'}
            strokeWidth="0.5"
            opacity="0.6"
          />
        ))}

        {/* Playhead */}
        <line
          x1={currentX} y1={0} x2={currentX} y2={HEIGHT}
          stroke="white" strokeWidth="0.5" opacity="0.5"
        />
      </svg>

      {/* Y-axis labels */}
      <div className="flex justify-between text-xs text-zinc-600">
        <span>0:00</span>
        <span className="text-zinc-500">
          55 engagement threshold · click to seek
        </span>
        <span>{Math.floor(totalMs / 60000)}:{String(Math.floor((totalMs % 60000) / 1000)).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
