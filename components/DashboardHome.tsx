'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UploadZone } from '@/components/UploadZone';
import { AnalysisCard } from '@/components/AnalysisCard';
import type { Analysis } from '@/types';

export function DashboardHome() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/analyses')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        setAnalyses(Array.isArray(data) ? data.slice(0, 5) : []);
        setLoading(false);
      })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-12">
      <section>
        <h2 className="section-title">New analysis</h2>
        <p className="mb-5 text-sm text-muted">
          Upload a talk or presentation to get timestamped engagement feedback.
        </p>
        <UploadZone onAnalysisCreated={(id) => router.push(`/analysis/${id}`)} />
      </section>

      {(loading || analyses.length > 0) && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Recent
            </h2>
            <a
              href="/history"
              className="text-xs font-semibold text-muted transition-colors hover:text-strong"
            >
              View all →
            </a>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {analyses.map((a) => (
                <AnalysisCard key={a.id} analysis={a} />
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && !loadError && analyses.length === 0 && (
        <p className="py-4 text-center text-sm text-faint">
          No talks yet — upload your first one above.
        </p>
      )}

      {!loading && loadError && (
        <p className="py-4 text-center text-sm text-faint">
          Couldn&apos;t load your recent talks.{' '}
          <button onClick={load} className="font-semibold" style={{ color: 'var(--text-link)' }}>
            Retry
          </button>
        </p>
      )}
    </div>
  );
}
