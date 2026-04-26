'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { createClient } from '@/lib/supabase/client';

interface Props {
  onAnalysisCreated: (id: string) => void;
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

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setProgress(5);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

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

      if (!createRes.ok) throw new Error('Failed to create analysis record.');
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
    maxSize: 500 * 1024 * 1024,
    maxFiles: 1,
    disabled: uploading,
  });

  const rejectionMsg = fileRejections[0]?.errors[0]?.message;

  return (
    <div>
      <div
        {...getRootProps()}
        className={[
          'border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 select-none',
          isDragActive
            ? 'border-purple-500 bg-purple-500/8'
            : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900',
          uploading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="space-y-4 py-2">
            <div className="w-10 h-10 mx-auto border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">Uploading… {progress}%</p>
            <div className="w-40 mx-auto bg-zinc-800 rounded-full h-1">
              <div
                className="bg-purple-500 h-1 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="w-14 h-14 mx-auto rounded-xl bg-zinc-800 flex items-center justify-center">
              <svg className="w-7 h-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">
                {isDragActive ? 'Drop to upload' : 'Drop your speech or presentation here'}
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                MP4, MOV, AVI, WebM, MP3, WAV, FLAC — up to 500 MB
              </p>
            </div>
            <button
              type="button"
              className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-xs rounded-lg transition-colors"
            >
              Choose file
            </button>
          </div>
        )}
      </div>

      {(error || rejectionMsg) && (
        <p className="mt-2 text-xs text-red-400 text-center">{error ?? rejectionMsg}</p>
      )}
    </div>
  );
}
