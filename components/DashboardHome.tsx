'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UploadZone } from '@/components/UploadZone';
import { AnalysisCard } from '@/components/AnalysisCard';
import type { Analysis } from '@/types';

export function DashboardHome() {
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

      {!loading && analyses.length === 0 && (
        <p className="py-4 text-center text-sm text-faint">
          No talks yet — upload your first one above.
        </p>
      )}
    </div>
  );
}
