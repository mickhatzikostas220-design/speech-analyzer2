'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UploadZone } from '@/components/UploadZone';
import { AnalysisCard } from '@/components/AnalysisCard';
import type { Analysis } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => r.json())
      .then((data) => {
        setAnalyses(Array.isArray(data) ? data.slice(0, 5) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">New Analysis</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Upload a speech or presentation to get timestamped neural engagement feedback.
        </p>
        <UploadZone
          onAnalysisCreated={(id) => router.push(`/analysis/${id}`)}
        />
      </div>

      {(loading || analyses.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Recent</h2>
            <a
              href="/history"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              View all →
            </a>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {analyses.map((a) => (
                <AnalysisCard key={a.id} analysis={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && analyses.length === 0 && (
        <p className="text-center text-zinc-600 text-sm py-4">
          No analyses yet — upload your first speech above.
        </p>
      )}
    </div>
  );
}
