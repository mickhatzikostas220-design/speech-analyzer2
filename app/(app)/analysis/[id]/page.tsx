'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { VideoPlayer } from '@/components/VideoPlayer';
import { EngagementChart } from '@/components/EngagementChart';
import { ROIChart } from '@/components/ROIChart';
import { ScoreRing } from '@/components/ScoreRing';
import { BrainMap } from '@/components/BrainMap';
import type { AnalysisDetail, FeedbackPoint, WordResponse } from '@/types';

const POLL_INTERVAL = 2500;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function severityColor(severity: string) {
  if (severity === 'high') return 'border-[color:var(--danger)] bg-[var(--danger-bg)]';
  if (severity === 'medium') return 'border-[color:var(--score-mid)] bg-[var(--warning-bg)]';
  return 'border-[color:var(--accent-2)] bg-[var(--info-bg)]';
}

function severityLabel(severity: string) {
  if (severity === 'high') return 'text-[color:var(--danger)]';
  if (severity === 'medium') return 'text-[color:var(--warning)]';
  return 'text-[color:var(--accent-2)]';
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ScorePill({ label, value, description, color }: { label: string; value: number; description: string; color: string }) {
  return (
    <div className="card p-4 flex-1 min-w-0">
      <p className="text-xs text-muted mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        <span className="text-faint text-sm mb-0.5">/100</span>
      </div>
      <p className="text-muted text-xs mt-1 leading-snug">{description}</p>
    </div>
  );
}

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [seekToMs, setSeekToMs] = useState<number | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/analyses/${id}`);
    if (!res.ok) { setError('Analysis not found.'); return; }
    const data: AnalysisDetail = await res.json();
    setDetail(data);
    if (data.analysis.status === 'complete' || data.analysis.status === 'error') {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
    pollRef.current = setInterval(fetchDetail, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchDetail]);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/analyses/${id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/dashboard'); }
    else { setDeleting(false); setShowDeleteConfirm(false); }
  }

  async function handleRename() {
    if (!titleInput.trim() || !detail) return;
    setRenameError(null);
    const res = await fetch(`/api/analyses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput.trim() }),
    });
    if (!res.ok) { setRenameError('Failed to rename. Try again.'); return; }
    setDetail(d => d ? { ...d, analysis: { ...d.analysis, title: titleInput.trim() } } : d);
    setEditingTitle(false);
  }

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    const res = await fetch(`/api/analyses/${id}/process`, { method: 'POST' });
    if (res.ok) {
      if (pollRef.current) clearInterval(pollRef.current);
      await fetchDetail();
      pollRef.current = setInterval(fetchDetail, POLL_INTERVAL);
    } else {
      const body = await res.json().catch(() => ({}));
      setRetryError(body.error ?? 'Retry failed. Please try again.');
    }
    setRetrying(false);
  }

  function downloadExport(format: 'transcript' | 'feedback' | 'json') {
    window.open(`/api/analyses/${id}/export?format=${format}`, '_blank');
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch(`/api/analyses/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok || !res.body) throw new Error('Failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: assistantText }]);
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-[color:var(--danger)]">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <div className="w-8 h-8 mx-auto border-2 border-[color:var(--signature)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { analysis, feedback_points, engagement_timeline, roi_timeline, file_url } = detail;
  const isPending = analysis.status === 'pending' || analysis.status === 'processing';
  const isError   = analysis.status === 'error';
  const durationMs = (analysis.duration_seconds ?? 60) * 1000;

  const activeFeedback: FeedbackPoint | undefined = feedback_points.find(
    (fp) => currentTimeMs >= fp.timecode_ms && currentTimeMs < fp.timecode_end_ms + 5000
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-surface-card border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-6 max-w-sm w-full shadow-[var(--shadow-lg)]">
            <h3 className="text-strong font-semibold mb-2">Delete analysis?</h3>
            <p className="text-muted text-sm mb-5">
              This will permanently delete the recording and all analysis data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 disabled:opacity-50 text-on-signature text-sm font-medium rounded-lg transition-colors"
                style={{ background: 'var(--danger)' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 hover:bg-[var(--surface-sunk)] text-body text-sm font-medium rounded-lg transition-colors border border-[var(--border-default)]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={titleInput}
                  onChange={e => { setTitleInput(e.target.value); setRenameError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditingTitle(false); setRenameError(null); } }}
                  className="input text-xl font-semibold w-full"
                />
                <button onClick={handleRename} className="text-xs px-3 py-1.5 btn-primary !rounded-lg flex-shrink-0">Save</button>
                <button onClick={() => { setEditingTitle(false); setRenameError(null); }} className="text-xs px-3 py-1.5 hover:bg-[var(--surface-sunk)] text-muted rounded-lg transition-colors flex-shrink-0 border border-[var(--border-default)]">Cancel</button>
              </div>
              {renameError && <p className="text-xs text-[color:var(--danger)]">{renameError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-xl font-extrabold text-strong truncate">{analysis.title}</h1>
              <button
                onClick={() => { setTitleInput(analysis.title); setEditingTitle(true); }}
                className="opacity-0 group-hover:opacity-100 p-1 text-faint hover:text-body transition-all"
                title="Rename">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-muted text-xs mt-1">{formatDate(analysis.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          {analysis.overall_score !== null && (
            <ScoreRing score={analysis.overall_score} size={64} />
          )}
          <button onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-faint hover:text-[color:var(--danger)] hover:bg-[var(--danger-bg)] rounded-lg transition-colors"
            title="Delete analysis">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mock data warning */}
      {analysis.status === 'complete' && analysis.is_mock && (
        <div className="bg-[var(--warning-bg)] border border-[color:var(--warning)] rounded-[var(--radius-md)] px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-[color:var(--warning)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-strong text-sm font-medium">Simulated data — Tribe v2 did not run</p>
            <p className="text-muted text-xs mt-0.5">
              The GPU model failed. Scores are randomly generated and not meaningful.
              Check that your HuggingFace token in Modal is valid and that you have accepted the
              facebook/tribev2 license on huggingface.co, then retry.
            </p>
          </div>
        </div>
      )}

      {/* Processing state */}
      {isPending && (
        <div className="card p-8 text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-[color:var(--signature)] border-t-transparent rounded-full animate-spin" />
          <p className="text-strong font-medium">
            {analysis.status === 'pending' ? 'Queued for analysis…' : 'Analyzing neural engagement…'}
          </p>
          <p className="text-muted text-sm">
            Running Tribe v2 brain predictions. This takes 10–20 minutes.
          </p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="bg-[var(--danger-bg)] border border-[color:var(--danger)] rounded-[var(--radius-md)] p-6 text-center space-y-3">
          <p className="text-[color:var(--danger)] font-medium">Analysis failed</p>
          {analysis.error_message && (
            <p className="text-muted text-sm">{analysis.error_message}</p>
          )}
          <button onClick={handleRetry} disabled={retrying}
            className="btn-outline text-sm !py-2 !px-4">
            {retrying ? 'Retrying…' : 'Retry analysis'}
          </button>
          {retryError && <p className="text-xs text-[color:var(--danger)]">{retryError}</p>}
        </div>
      )}

      {/* ── Complete ── */}
      {analysis.status === 'complete' && file_url && (
        <>
          <VideoPlayer
            fileUrl={file_url}
            fileType={analysis.file_type}
            activeFeedback={activeFeedback}
            onTimeUpdate={setCurrentTimeMs}
            seekToMs={seekToMs}
          />

          {/* Summary stat pills */}
          {(analysis.cognitive_load_score !== null || analysis.mind_wandering_score !== null) && (
            <div className="flex gap-3 flex-wrap">
              {analysis.overall_score !== null && (
                <ScorePill
                  label="Overall Engagement"
                  value={analysis.overall_score}
                  description="Average predicted neural engagement across the full speech"
                  color="text-accent"
                />
              )}
              {analysis.cognitive_load_score !== null && (
                <ScorePill
                  label="Cognitive Load"
                  value={analysis.cognitive_load_score}
                  description="How hard the attention network worked — higher means more demanding content"
                  color="text-[color:var(--success)]"
                />
              )}
              {analysis.mind_wandering_score !== null && (
                <ScorePill
                  label="Mind-Wandering Risk"
                  value={analysis.mind_wandering_score}
                  description="Average Default Mode Network activity — higher means the audience's mind was more likely to wander"
                  color={analysis.mind_wandering_score > 60 ? 'text-[color:var(--danger)]' : 'text-[color:var(--warning)]'}
                />
              )}
            </div>
          )}

          {/* Engagement timeline */}
          {engagement_timeline.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-medium text-body mb-3">Neural Engagement Timeline</h2>
              <EngagementChart
                timeline={engagement_timeline}
                feedbackPoints={feedback_points}
                currentTimeMs={currentTimeMs}
                durationMs={durationMs}
                onSeek={(ms) => setSeekToMs(ms)}
              />
            </div>
          )}

          {/* ROI timeline (4 brain regions over time) */}
          {roi_timeline.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-medium text-body mb-1">Brain Region Activity Over Time</h2>
              <p className="text-muted text-xs mb-3">
                How each cortical region&apos;s activation changed second by second. Each line is independently normalized 0–100.
              </p>
              <ROIChart
                timeline={roi_timeline}
                durationMs={durationMs}
                currentTimeMs={currentTimeMs}
                onSeek={(ms) => setSeekToMs(ms)}
              />
            </div>
          )}

          {/* Brain map */}
          <div className="card p-5">
            <h2 className="text-sm font-medium text-body mb-4">Overall Brain Activity Map</h2>
            {analysis.overall_brain_activations ? (
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <BrainMap activations={analysis.overall_brain_activations} size={160} />
                <div className="flex-1 space-y-3 text-sm text-muted">
                  <p>
                    Average cortical activation across your speech, derived from Tribe v2&apos;s fMRI
                    encoding model. Warmer colours = higher predicted activation.
                  </p>
                  <div className="space-y-1.5">
                    {[
                      { name: 'Auditory', desc: 'Primary + secondary auditory cortex — how strongly the speech sound was processed.' },
                      { name: 'Language', desc: 'Left perisylvian network (Broca\'s + Wernicke\'s) — language comprehension load.' },
                      { name: 'Attention', desc: 'Bilateral parietal cortex (IPS) — sustained attention and cognitive control.' },
                      { name: 'DMN',      desc: 'Default Mode Network — elevated DMN = mind-wandering and disengagement.' },
                    ].map(({ name, desc }) => (
                      <div key={name} className="flex items-start gap-2">
                        <span className="text-strong font-medium w-20 flex-shrink-0">{name}</span>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted text-sm">Brain map data not available for this analysis.</p>
                <p className="text-faint text-xs mt-1">
                  Re-run the analysis after deploying the latest Modal server to generate brain maps.
                </p>
                {!isError && (
                  <>
                    <button onClick={handleRetry} disabled={retrying}
                      className="mt-3 btn-outline text-xs !py-1.5 !px-4">
                      {retrying ? 'Retrying…' : 'Re-analyze'}
                    </button>
                    {retryError && <p className="text-xs text-[color:var(--danger)] mt-2">{retryError}</p>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Peak moments */}
          {analysis.peak_moments && analysis.peak_moments.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-body">
                {analysis.peak_moments.length} Peak Moment{analysis.peak_moments.length !== 1 ? 's' : ''} — Your Best
              </h2>
              {analysis.peak_moments.map((pm, i) => (
                <button
                  key={i}
                  onClick={() => setSeekToMs(pm.start_ms)}
                  className="w-full text-left border border-[color:var(--success)] bg-[var(--success-bg)] rounded-[var(--radius-md)] p-4 transition-all hover:shadow-[var(--shadow-sm)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted">
                      {formatMs(pm.start_ms)} – {formatMs(pm.end_ms)}
                    </span>
                    <span className="text-xs font-medium text-[color:var(--success)]">{pm.score}/100</span>
                    <span className="text-xs uppercase tracking-wide text-[color:var(--success)]">peak engagement</span>
                  </div>
                  <p className="text-muted text-sm mt-1">
                    High neural engagement across auditory, language, and attention networks during this segment.
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Transcript */}
          {analysis.transcript && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-body">Transcript</h2>
                <button onClick={() => downloadExport('transcript')}
                  className="text-xs font-semibold transition-colors flex items-center gap-1"
                  style={{ color: 'var(--text-link)' }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export .txt
                </button>
              </div>
              <p className="text-body text-sm leading-relaxed whitespace-pre-wrap">
                {analysis.transcript}
              </p>
            </div>
          )}

          {/* Word Neural Response */}
          {analysis.word_responses && analysis.word_responses.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-medium text-body mb-1">Word Neural Response</h2>
              <p className="text-muted text-xs mb-4">Each word coloured by predicted neural activation. Green = high engagement, red = low.</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.word_responses.map((w: WordResponse, i: number) => {
                  const avg = Math.round((w.score + w.emotional + w.memory) / 3);
                  const r = avg < 50 ? 255 : Math.round(255 * (1 - (avg - 50) / 50));
                  const g = avg > 50 ? 255 : Math.round(255 * (avg / 50));
                  return (
                    <button
                      key={i}
                      onClick={() => setSeekToMs(Math.round(w.start * 1000))}
                      title={`Engagement: ${w.score} · Emotional: ${w.emotional} · Memory: ${w.memory} · Prosody: ${w.prosody}`}
                      className="text-sm px-1 py-0.5 rounded transition-opacity hover:opacity-80"
                      style={{ color: `rgb(${r},${g},80)`, fontWeight: avg > 70 ? 600 : 400 }}
                    >
                      {w.word}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <div className="h-1.5 flex-1 rounded-full" style={{ background: 'linear-gradient(to right, rgb(255,0,80), rgb(255,255,80), rgb(0,255,80))' }} />
                <span className="text-[10px] text-muted">low → high activation</span>
              </div>
            </div>
          )}

          {/* Engagement drops */}
          {feedback_points.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-body">
                  {feedback_points.length} Engagement Drop{feedback_points.length !== 1 ? 's' : ''} Detected
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => downloadExport('feedback')}
                    className="text-xs font-semibold transition-colors flex items-center gap-1"
                    style={{ color: 'var(--text-link)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export .csv
                  </button>
                  <button onClick={() => downloadExport('json')}
                    className="text-xs text-muted hover:text-body transition-colors flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export .json
                  </button>
                </div>
              </div>
              {feedback_points.map((fp) => (
                <div key={fp.id} className={`border rounded-[var(--radius-md)] transition-all ${severityColor(fp.severity)}`}>
                  <button
                    onClick={() => setSeekToMs(fp.timecode_ms)}
                    className="w-full text-left p-4 hover:bg-[var(--surface-sunk)] rounded-t-[var(--radius-md)] transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono text-muted">
                        {formatMs(fp.timecode_ms)} – {formatMs(fp.timecode_end_ms)}
                      </span>
                      <span className={`text-xs font-medium ${severityLabel(fp.severity)}`}>
                        {fp.engagement_score}/100
                      </span>
                      <span className={`text-xs uppercase tracking-wide ${severityLabel(fp.severity)}`}>
                        {fp.severity} drop
                      </span>
                    </div>
                    <p className="text-strong text-sm">{fp.feedback_text}</p>
                    <p className="text-muted text-sm mt-1">→ {fp.improvement_suggestion}</p>
                  </button>
                  {fp.brain_activations && (
                    <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3">
                      <p className="text-xs text-muted mb-3">Brain activity at this moment</p>
                      <BrainMap activations={fp.brain_activations} size={130} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {feedback_points.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-[color:var(--success)] font-medium">No significant engagement drops detected.</p>
              <p className="text-muted text-sm mt-1">
                Neural engagement stayed above the 55/100 threshold throughout.
              </p>
            </div>
          )}

        </>
      )}

      {/* Chat panel — shown for all completed analyses */}
      {analysis.status === 'complete' && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-md bg-signature flex-shrink-0" />
            <h2 className="text-sm font-medium text-body">Ask about your speech</h2>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto mb-3 pr-1">
            {chatMessages.length === 0 && (
              <div className="py-6 text-center space-y-2">
                <p className="text-muted text-sm">Ask anything about your neural data.</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['Why did my engagement drop?', 'What were my strongest moments?', 'How can I improve my prosody?'].map(q => (
                    <button
                      key={q}
                      onClick={() => setChatInput(q)}
                      className="text-xs px-3 py-1.5 bg-surface-sunk hover:bg-[var(--ink-200)] text-body rounded-full border border-[var(--border-subtle)] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-signature text-on-signature'
                    : 'bg-surface-sunk text-body'
                }`}>
                  {msg.content || <span className="opacity-40 animate-pulse">Thinking…</span>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={sendChat} className="flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask anything about your data…"
              disabled={chatLoading}
              className="input flex-1 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="btn-primary text-sm !py-2 !px-4 flex-shrink-0"
            >
              {chatLoading ? '…' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
