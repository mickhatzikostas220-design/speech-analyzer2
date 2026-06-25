'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { createClient } from '@/lib/supabase/client';

interface Props {
  onAnalysisCreated: (id: string) => void;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // free-plan default until /me loads

interface BillingInfo {
  planName: string;
  maxUploadBytes: number;
  remaining: number | null;
}

function formatMb(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;
}

const ACCEPTED = {
  'video/mp4': ['.mp4'],
  'video/avi': ['.avi'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/flac': ['.flac'],
  'audio/ogg': ['.ogg'],
};

function getMediaDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(el.duration) ? el.duration : 60);
    };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(60); };
    el.src = url;
  });
}

export function UploadZone({ onAnalysisCreated }: Props) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/billing/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setBilling({
            planName: data.planName,
            maxUploadBytes: data.maxUploadBytes ?? DEFAULT_MAX_BYTES,
            remaining: data.remaining ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const maxBytes = billing?.maxUploadBytes ?? DEFAULT_MAX_BYTES;

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setError(null);
    setNeedsUpgrade(false);
    setUploading(true);
    setProgress(5);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      if (file.size > maxBytes) {
        setNeedsUpgrade(true);
        throw new Error(
          `That file is ${formatMb(file.size)}. Your ${billing?.planName ?? 'Free'} plan allows up to ${formatMb(
            maxBytes
          )}. Upgrade for larger uploads.`
        );
      }

      const ext = file.name.split('.').pop() ?? 'bin';
      const filePath = `${user.id}/${Date.now()}.${ext}`;
      const fileType: 'video' | 'audio' = file.type.startsWith('video/') ? 'video' : 'audio';

      const [durationSeconds] = await Promise.all([getMediaDuration(file)]);
      setProgress(15);

      const uploadTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out. Check your connection and try again.')), 120000)
      );

      const { error: storageErr } = await Promise.race([
        supabase.storage.from('speeches').upload(filePath, file, { contentType: file.type, cacheControl: '3600' }),
        uploadTimeout,
      ]);

      if (storageErr) throw new Error(storageErr.message ?? 'Upload failed. Please try again.');
      setProgress(60);

      const createRes = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: file.name.replace(/\.[^/.]+$/, ''),
          file_path: filePath,
          file_type: fileType,
          duration_seconds: durationSeconds,
        }),
      });

      if (!createRes.ok) {
        const payload = await createRes.json().catch(() => null);
        if (payload?.upgrade) setNeedsUpgrade(true);
        throw new Error(payload?.error ?? 'Failed to create analysis record.');
      }
      const { id } = await createRes.json();
      setProgress(80);

      // Trigger processing (fire and forget — page will poll for status)
      fetch(`/api/analyses/${id}/process`, { method: 'POST' }).catch(console.error);
      setProgress(100);

      onAnalysisCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [supabase, onAnalysisCreated]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: maxBytes,
    maxFiles: 1,
    disabled: uploading,
  });

  const rejectionMsg = fileRejections[0]?.errors[0]?.message;

  return (
    <div>
      <div
        {...getRootProps()}
        className={[
          'cursor-pointer select-none rounded-[var(--radius-lg)] border-2 border-dashed p-10 text-center transition-all duration-200',
          isDragActive
            ? 'border-[var(--signature)] bg-[color:var(--signature)]/10'
            : 'border-[var(--border-default)] bg-surface-card hover:border-strong',
          uploading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="space-y-4 py-2">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--ink-200)] border-t-[var(--signature)]" />
            <p className="text-sm text-muted">Uploading… {progress}%</p>
            <div className="mx-auto h-1.5 w-40 rounded-full bg-[var(--surface-sunk)]">
              <div
                className="h-1.5 rounded-full bg-[var(--signature)] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--signature)]">
              <svg className="h-7 w-7" style={{ color: 'var(--on-signature)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-strong">
                {isDragActive ? 'Drop to upload' : 'Drop your talk here'}
              </p>
              <p className="mt-1 text-xs text-muted">
                MP4, MOV, AVI, WebM, MP3, WAV, FLAC — up to {formatMb(maxBytes)}
              </p>
              {billing?.remaining != null && (
                <p className="mt-1 text-xs text-muted">
                  {billing.remaining} analysis{billing.remaining === 1 ? '' : 'es'} left this month on{' '}
                  {billing.planName}.
                </p>
              )}
            </div>
            <button type="button" className="btn-outline" style={{ padding: '8px 18px', fontSize: 'var(--text-sm)' }}>
              Choose file
            </button>
          </div>
        )}
      </div>

      {(error || rejectionMsg) && (
        <p className="mt-2 text-center text-xs" style={{ color: 'var(--danger)' }}>{error ?? rejectionMsg}</p>
      )}
      {needsUpgrade && (
        <p className="mt-2 text-center text-xs">
          <Link href="/pricing" className="font-bold underline" style={{ color: 'var(--signature)' }}>
            View plans &amp; upgrade →
          </Link>
        </p>
      )}
    </div>
  );
}
