'use client';

import { useState, useEffect, useMemo } from 'react';
import { AnalysisCard } from '@/components/AnalysisCard';
import type { Analysis } from '@/types';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => r.json())
      .then((data) => {
        setAnalyses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return analyses;
    const q = query.toLowerCase();
    return analyses.filter((a) => a.title.toLowerCase().includes(q));
  }, [analyses, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Talk Library</p>
          <h1 className="display-h1" style={{ fontSize: 'var(--text-h2)' }}>All your talks</h1>
        </div>
        {!loading && analyses.length > 0 && (
          <span className="text-sm text-muted">{filtered.length} of {analyses.length}</span>
        )}
      </div>

      {/* Search */}
      {!loading && analyses.length > 0 && (
        <div className="relative mb-5">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
          </svg>
          <input
            type="text"
            placeholder="Search your talks…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="input w-full pl-9 text-sm"
          />
          {query && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-strong"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunk)]" />
          ))}
        </div>
      ) : analyses.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-muted">No talks yet.</p>
          <a href="/analyze" className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--text-link)' }}>
            Upload your first talk →
          </a>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted">No results for “{query}”</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map((a) => (
              <AnalysisCard key={a.id} analysis={a} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-[var(--radius-pill)] border-2 border-[var(--border-strong)] px-3.5 py-1.5 text-sm font-bold text-strong transition hover:bg-[var(--surface-sunk)] disabled:pointer-events-none disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-sm text-muted">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-[var(--radius-pill)] border-2 border-[var(--border-strong)] px-3.5 py-1.5 text-sm font-bold text-strong transition hover:bg-[var(--surface-sunk)] disabled:pointer-events-none disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
