'use client';

// Add-a-keynote form. Upload a PDF, Word (.docx), or text file — parsed to text
// right in the browser (see lib/keynotes/parseFile) — or paste/type the
// description directly. On save it creates the master keynote and opens its
// detail page, where it can branch into industry-tailored versions.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, Plus } from 'lucide-react';
import { extractTextFromFile, type ParsedSource } from '@/lib/keynotes/parseFile';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
};

export function NewKeynoteForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<ParsedSource | 'paste'>('paste');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setParsing(true);
    try {
      const { text, source: src } = await extractTextFromFile(file);
      if (!text.trim()) {
        setError('Couldn’t find any text in that file. Try another file, or paste the text below.');
      } else {
        setDescription(text);
        setSource(src);
        // Prefill the title from the filename only if the user hasn't typed one.
        setTitle((cur) => cur || file.name.replace(/\.[^./]+$/, '').replace(/[-_]+/g, ' ').trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that file.');
    } finally {
      setParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 15 * 1024 * 1024,
    disabled: parsing || saving,
  });

  async function save() {
    setError(null);
    if (!title.trim()) {
      setError('Give your keynote a title.');
      return;
    }
    if (description.trim().length < 40) {
      setError('Add a fuller description — at least a few sentences — so there’s something to tailor.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/keynotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Couldn’t save your keynote. Please try again.');
        setSaving(false);
        return;
      }
      router.push(`/keynotes/${data.id}`);
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  }

  const rejection = fileRejections[0]?.errors[0]?.message;

  return (
    <div className="card p-5">
      <div
        {...getRootProps()}
        className={[
          'cursor-pointer select-none rounded-[var(--radius-md)] border-2 border-dashed p-6 text-center transition-all',
          isDragActive
            ? 'border-[var(--signature)] bg-[color:var(--signature)]/10'
            : 'border-[var(--border-default)] hover:border-strong',
          parsing ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        {parsing ? (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your file…
          </div>
        ) : (
          <div className="py-1">
            <Upload className="mx-auto mb-2 h-6 w-6 text-muted" />
            <p className="text-sm font-semibold text-strong">
              {isDragActive ? 'Drop to read it' : 'Upload a PDF, Word (.docx), or text file'}
            </p>
            <p className="mt-0.5 text-xs text-muted">…or just paste your description below</p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Keynote title"
          className="input w-full text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste or type your keynote description here…"
          rows={7}
          className="input w-full resize-y text-sm"
        />
      </div>

      {(error || rejection) && (
        <p
          className="mt-3 rounded-[var(--radius-sm)] bg-[var(--danger-bg)] px-3 py-2 text-sm"
          style={{ color: 'var(--danger)' }}
        >
          {error ?? rejection}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={save} disabled={saving || parsing} className="btn-primary">
          {saving ? 'Saving…' : (
            <>
              <Plus className="h-4 w-4" /> Save keynote
            </>
          )}
        </button>
      </div>
    </div>
  );
}
