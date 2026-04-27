'use client';

import { useState, useEffect, useRef } from 'react';
import type { Analysis, AnalysisDetail, ROITimepoint } from '@/types';

type MetricKey = 'engagement' | 'auditory' | 'language' | 'attention' | 'dmn' | 'prosody' | 'emotional' | 'memory';

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'engagement', label: 'Engagement', color: '#8b5cf6' },
  { key: 'auditory',   label: 'Auditory',   color: '#06b6d4' },
  { key: 'language',   label: 'Language',   color: '#a855f7' },
  { key: 'attention',  label: 'Attention',  color: '#22c55e' },
  { key: 'dmn',        label: 'DMN',        color: '#f59e0b' },
  { key: 'prosody',    label: 'Prosody',    color: '#f472b6' },
  { key: 'emotional',  label: 'Emotional',  color: '#fb923c' },
  { key: 'memory',     label: 'Memory',     color: '#34d399' },
];

const CHART_H = 120;

function getVal(
  point: { score?: number } & Partial<ROITimepoint>,
  key: MetricKey
): number {
  if (key === 'engagement') return point.score ?? 0;
  return (point as ROITimepoint)[key] ?? 0;
}

interface ChartData {
  detail: AnalysisDetail;
  engagementByMs: Map<number, number>;
  roiByMs: Map<number, ROITimepoint>;
  maxMs: number;
}

function buildChartData(detail: AnalysisDetail): ChartData {
  const engagementByMs = new Map<number, number>();
  for (const pt of detail.engagement_timeline) {
    engagementByMs.set(pt.timecode_ms, pt.score);
  }
  const roiByMs = new Map<number, ROITimepoint>();
  for (const pt of detail.roi_timeline) {
    roiByMs.set(pt.timecode_ms, pt);
  }
  const allMs = [
    ...detail.engagement_timeline.map(p => p.timecode_ms),
    ...detail.roi_timeline.map(p => p.timecode_ms),
  ];
  const maxMs = allMs.length ? Math.max(...allMs) + 1000 : 60000;
  return { detail, engagementByMs, roiByMs, maxMs };
}

function getPoints(data: ChartData, key: MetricKey): number[] {
  const source = key === 'engagement' ? data.engagementByMs : data.roiByMs;
  const keys = Array.from(source.keys()).sort((a, b) => a - b);
  return keys.map(ms => {
    if (key === 'engagement') return data.engagementByMs.get(ms) ?? 0;
    const pt = data.roiByMs.get(ms);
    return pt ? (pt[key as keyof ROITimepoint] as number) : 0;
  });
}

function getTimestamps(data: ChartData, key: MetricKey): number[] {
  const source = key === 'engagement' ? data.engagementByMs : data.roiByMs;
  return Array.from(source.keys()).sort((a, b) => a - b);
}

interface CompareChartProps {
  dataA: ChartData;
  dataB: ChartData;
  activeMetrics: Set<MetricKey>;
  focusMetric: MetricKey | null;
  labelA: string;
  labelB: string;
}

function CompareChart({ dataA, dataB, activeMetrics, focusMetric, labelA, labelB }: CompareChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const maxMs = Math.max(dataA.maxMs, dataB.maxMs);

  function xPct(ms: number, maxMsDuration: number) {
    return (ms / maxMsDuration) * 100;
  }

  function yVal(v: number) {
    return CHART_H - (v / 100) * CHART_H;
  }

  function opacity(key: MetricKey) {
    if (!focusMetric) return 0.85;
    return focusMetric === key ? 1 : 0.12;
  }

  function strokeWidth(key: MetricKey) {
    if (!focusMetric) return 0.7;
    return focusMetric === key ? 1.2 : 0.5;
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 100 ${CHART_H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: CHART_H * 2 }}
      >
        {/* Grid */}
        {[25, 50, 75].map(v => (
          <line key={v} x1={0} y1={yVal(v)} x2={100} y2={yVal(v)}
            stroke="#27272a" strokeWidth="0.3" strokeDasharray="1,1" />
        ))}
        <text x={0.5} y={yVal(75) - 1} fontSize="2.5" fill="#52525b">75</text>
        <text x={0.5} y={yVal(50) - 1} fontSize="2.5" fill="#52525b">50</text>
        <text x={0.5} y={yVal(25) - 1} fontSize="2.5" fill="#52525b">25</text>

        {METRICS.filter(m => activeMetrics.has(m.key)).map(({ key, color }) => {
          const tsA = getTimestamps(dataA, key);
          const ptsA = getPoints(dataA, key);
          const tsB = getTimestamps(dataB, key);
          const ptsB = getPoints(dataB, key);

          const pointsA = tsA.map((ms, i) => `${xPct(ms, dataA.maxMs)},${yVal(ptsA[i])}`).join(' ');
          const pointsB = tsB.map((ms, i) => `${xPct(ms, dataB.maxMs)},${yVal(ptsB[i])}`).join(' ');

          return (
            <g key={key} opacity={opacity(key)}>
              {/* Speech A — solid */}
              <polyline points={pointsA} fill="none" stroke={color}
                strokeWidth={strokeWidth(key)} strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
              {/* Speech B — dashed */}
              <polyline points={pointsB} fill="none" stroke={color}
                strokeWidth={strokeWidth(key)} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="2,1.5" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>

      {/* A/B labels */}
      <div className="absolute top-2 right-2 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="white" strokeWidth="1.5" /></svg>
          {labelA}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="white" strokeWidth="1.5" strokeDasharray="3,2" /></svg>
          {labelB}
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, valA, valB, unit = '' }: { label: string; valA: number | null; valB: number | null; unit?: string }) {
  const a = valA ?? 0;
  const b = valB ?? 0;
  const diff = a - b;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1">
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      <div className="flex items-end gap-3">
        <div>
          <p className="text-xl font-bold text-white">{a}{unit}</p>
          <p className="text-xs text-zinc-600 mt-0.5">Speech A</p>
        </div>
        <div>
          <p className="text-xl font-bold text-zinc-400">{b}{unit}</p>
          <p className="text-xs text-zinc-600 mt-0.5">Speech B</p>
        </div>
        {valA !== null && valB !== null && (
          <p className={`text-sm font-medium ml-auto ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
            {diff > 0 ? '+' : ''}{diff}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [dataA, setDataA] = useState<ChartData | null>(null);
  const [dataB, setDataB] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(new Set(METRICS.map(m => m.key)));
  const [focusMetric, setFocusMetric] = useState<MetricKey | null>(null);

  useEffect(() => {
    fetch('/api/analyses')
      .then(r => r.json())
      .then((data: Analysis[]) => setAnalyses(data.filter(a => a.status === 'complete')));
  }, []);

  async function fetchDetail(id: string): Promise<ChartData | null> {
    const res = await fetch(`/api/analyses/${id}`);
    if (!res.ok) return null;
    const detail: AnalysisDetail = await res.json();
    return buildChartData(detail);
  }

  async function handleCompare() {
    if (!idA || !idB) return;
    setLoading(true);
    const [a, b] = await Promise.all([fetchDetail(idA), fetchDetail(idB)]);
    setDataA(a);
    setDataB(b);
    setLoading(false);
  }

  function toggleMetric(key: MetricKey) {
    if (focusMetric === key) {
      setFocusMetric(null);
    } else {
      setFocusMetric(key);
    }
  }

  const labelA = analyses.find(a => a.id === idA)?.title ?? 'Speech A';
  const labelB = analyses.find(a => a.id === idB)?.title ?? 'Speech B';

  const ready = dataA && dataB;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Compare Speeches</h1>
        <p className="text-zinc-500 text-sm mt-1">Overlay two analyses to compare neural engagement across every metric.</p>
      </div>

      {/* Selection */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <label className="text-xs text-zinc-500 block mb-1.5">Speech A <span className="text-white">(solid line)</span></label>
          <select
            value={idA}
            onChange={e => setIdA(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
          >
            <option value="">Select a speech…</option>
            {analyses.map(a => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-zinc-500 block mb-1.5">Speech B <span className="text-zinc-400">(dashed line)</span></label>
          <select
            value={idB}
            onChange={e => setIdB(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
          >
            <option value="">Select a speech…</option>
            {analyses.map(a => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleCompare}
          disabled={!idA || !idB || loading}
          className="px-5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Loading…' : 'Compare'}
        </button>
      </div>

      {ready && (
        <>
          {/* Score summary */}
          <div className="flex flex-wrap gap-3">
            <StatCard label="Overall Engagement" valA={dataA.detail.analysis.overall_score} valB={dataB.detail.analysis.overall_score} unit="/100" />
            <StatCard label="Cognitive Load" valA={dataA.detail.analysis.cognitive_load_score} valB={dataB.detail.analysis.cognitive_load_score} unit="/100" />
            <StatCard label="Mind Wandering" valA={dataA.detail.analysis.mind_wandering_score} valB={dataB.detail.analysis.mind_wandering_score} unit="/100" />
          </div>

          {/* Metric pills */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-xs text-zinc-500 mb-3">Click a metric to isolate it — click again to show all</p>
              <div className="flex flex-wrap gap-2">
                {METRICS.map(({ key, label, color }) => {
                  const isFocused = focusMetric === key;
                  const isDimmed = focusMetric !== null && !isFocused;
                  return (
                    <button
                      key={key}
                      onClick={() => toggleMetric(key)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        isFocused
                          ? 'border-white/40 bg-white/10 text-white'
                          : isDimmed
                          ? 'border-zinc-800 text-zinc-600'
                          : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <CompareChart
              dataA={dataA}
              dataB={dataB}
              activeMetrics={activeMetrics}
              focusMetric={focusMetric}
              labelA={labelA}
              labelB={labelB}
            />

            {/* Color legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-zinc-800">
              {METRICS.filter(m => !focusMetric || focusMetric === m.key).map(({ key, label, color }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded-full" style={{ background: color }} />
                  <span className="text-[11px] text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
