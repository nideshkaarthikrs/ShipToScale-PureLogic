'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { uploadDocument, ANALYSIS_STORAGE_KEY } from '@/lib/api';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

export default function UploadZone() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const onSelect = useCallback(
    async (file) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      setProgress(0);
      try {
        const payload = await uploadDocument(file, { onProgress: setProgress });
        sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
        router.push('/dashboard');
      } catch (err) {
        setError(err.message || 'Upload failed. Please try a different file.');
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onSelect(file);
  };

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'flex h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 text-center transition',
          dragOver ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400',
          busy ? 'pointer-events-none opacity-90' : '',
        ].join(' ')}
      >
        {busy ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-700">Analyzing document…</p>
            <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-slate-900 transition-all" style={{ width: `${Math.max(8, progress * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-500" />
            <p className="mt-3 text-base font-medium text-slate-700">Drag and drop a document here</p>
            <p className="mt-1 text-sm text-slate-500">PDF, JPG, or PNG — up to 20 MB</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              <FileText className="h-4 w-4" />
              Choose file
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
