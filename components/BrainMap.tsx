'use client';

import { useId } from 'react';
import type { ROIActivations } from '@/types';

interface Props {
  activations: ROIActivations;
  size?: number;
}

// Maps a 0–1 activation value to a color (blue → cyan → green → yellow → red)
function actColor(v: number): string {
  const stops: [number, number, number][] = [
    [30,  60,  210],  // deep blue   (0.00)
    [0,   160, 255],  // sky blue    (0.25)
    [0,   210, 150],  // teal        (0.50)
    [255, 195, 0],    // yellow      (0.75)
    [255, 45,  0],    // red-orange  (1.00)
  ];
  const raw = v * (stops.length - 1);
  const lo = Math.floor(Math.min(raw, stops.length - 2));
  const hi = lo + 1;
  const t = raw - lo;
  const ch = (i: number) => Math.round(stops[lo][i] + t * (stops[hi][i] - stops[lo][i]));
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

const REGIONS = [
  { key: 'auditory'  as const, label: 'Auditory'  },
  { key: 'language'  as const, label: 'Language'  },
  { key: 'attention' as const, label: 'Attention' },
  { key: 'dmn'       as const, label: 'DMN'       },
];

export function BrainMap({ activations: a, size = 180 }: Props) {
  const uid = useId();
  const clipId = `bc-${uid}`;
  const h = Math.round(size * 1.1);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={h} viewBox="0 0 200 220">
        <defs>
          <clipPath id={clipId}>
            {/* Brain silhouette (dorsal / top-down view) */}
            <path d="M100,14 C128,12 158,32 172,62 C186,92 184,130 172,158 C160,186 138,204 116,210 C108,213 92,213 84,210 C62,204 40,186 28,158 C16,130 14,92 28,62 C42,32 72,12 100,14 Z" />
          </clipPath>
        </defs>

        {/* ── Brain base ── */}
        <path
          d="M100,14 C128,12 158,32 172,62 C186,92 184,130 172,158 C160,186 138,204 116,210 C108,213 92,213 84,210 C62,204 40,186 28,158 C16,130 14,92 28,62 C42,32 72,12 100,14 Z"
          fill="#1c1c1e"
          stroke="#3f3f46"
          strokeWidth="1.5"
        />

        {/* ── DMN — medial strip running front-to-back ── */}
        <ellipse cx="100" cy="100" rx="16" ry="58"
          fill={actColor(a.dmn)} opacity="0.65" clipPath={`url(#${clipId})`} />

        {/* ── Attention — bilateral parietal (upper) ── */}
        <ellipse cx="70" cy="72" rx="34" ry="24"
          fill={actColor(a.attention)} opacity="0.72" clipPath={`url(#${clipId})`} />
        <ellipse cx="130" cy="72" rx="34" ry="24"
          fill={actColor(a.attention)} opacity="0.72" clipPath={`url(#${clipId})`} />

        {/* ── Language — left perisylvian ── */}
        <ellipse cx="58" cy="118" rx="30" ry="26"
          fill={actColor(a.language)} opacity="0.72" clipPath={`url(#${clipId})`} />

        {/* ── Auditory — bilateral temporal (lower) ── */}
        <ellipse cx="56" cy="166" rx="28" ry="32"
          fill={actColor(a.auditory)} opacity="0.72" clipPath={`url(#${clipId})`} />
        <ellipse cx="144" cy="166" rx="28" ry="32"
          fill={actColor(a.auditory)} opacity="0.72" clipPath={`url(#${clipId})`} />

        {/* ── Sulci / cortical texture ── */}
        <g clipPath={`url(#${clipId})`} stroke="#2a2a2e" strokeWidth="1" fill="none" opacity="0.9">
          {/* Central sulcus (bilateral) */}
          <path d="M66,34 C68,68 66,100 62,130" />
          <path d="M134,34 C132,68 134,100 138,130" />
          {/* Lateral sulcus */}
          <path d="M20,118 C38,110 60,109 74,117" />
          <path d="M180,118 C162,110 140,109 126,117" />
          {/* Parieto-occipital */}
          <path d="M76,158 C88,165 112,165 124,158" />
        </g>

        {/* ── Midline (interhemispheric fissure) ── */}
        <line x1="100" y1="15" x2="100" y2="210"
          stroke="#3f3f46" strokeWidth="1" clipPath={`url(#${clipId})`} />

        {/* ── Brain outline on top ── */}
        <path
          d="M100,14 C128,12 158,32 172,62 C186,92 184,130 172,158 C160,186 138,204 116,210 C108,213 92,213 84,210 C62,204 40,186 28,158 C16,130 14,92 28,62 C42,32 72,12 100,14 Z"
          fill="none"
          stroke="#52525b"
          strokeWidth="1.5"
        />

        {/* ── Region labels ── */}
        <text x="100" y="188" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="sans-serif">Auditory</text>
        <text x="52" y="112" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="sans-serif">Lang</text>
        <text x="100" y="56" textAnchor="middle" fontSize="8" fill="#71717a" fontFamily="sans-serif">Attention</text>
        <text x="100" y="102" textAnchor="middle" fontSize="7" fill="#71717a" fontFamily="sans-serif">DMN</text>
      </svg>

      {/* Activation dots per region */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {REGIONS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: actColor(a[key]) }}
            />
            <span className="text-[10px] text-zinc-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Color scale */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[9px] text-zinc-600">low</span>
        <div
          className="h-1 w-16 rounded-full"
          style={{
            background:
              'linear-gradient(to right, rgb(30,60,210), rgb(0,160,255), rgb(0,210,150), rgb(255,195,0), rgb(255,45,0))',
          }}
        />
        <span className="text-[9px] text-zinc-600">high</span>
      </div>
    </div>
  );
}
