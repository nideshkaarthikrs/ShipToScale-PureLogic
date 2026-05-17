'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, AlertCircle, Loader2, ScanLine } from 'lucide-react';
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
          'relative flex min-h-80 w-full flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed px-6 text-center transition duration-200',
          dragOver ? 'border-teal-500 bg-teal-50/70 shadow-[0_20px_60px_rgba(20,184,166,0.16)]' : 'border-slate-300/90 bg-white/82 hover:border-slate-500 hover:bg-white',
          busy ? 'pointer-events-none opacity-90' : '',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-x-8 top-6 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <div className="pointer-events-none absolute -bottom-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-teal-400/10 blur-3xl" />
        {busy ? (
          <>
            <div className="icon-tile h-14 w-14 text-teal-700">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <p className="mt-4 text-sm font-bold text-slate-900">Analyzing document</p>
            <p className="mt-1 text-xs text-slate-500">OCR, clause mapping, precedent retrieval</p>
            <div className="mt-5 h-2 w-64 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-gradient-to-r from-slate-950 via-teal-600 to-amber-500 transition-all" style={{ width: `${Math.max(8, progress * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="icon-tile h-16 w-16 text-slate-950">
              {dragOver ? <ScanLine className="h-8 w-8 text-teal-600" /> : <Upload className="h-8 w-8" />}
            </div>
            <p className="mt-5 text-lg font-black tracking-tight text-slate-950">
              {dragOver ? 'Drop it here to start analysis' : 'Drag a document into CivicLens'}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
              PDF, JPG, or PNG up to 20 MB. We will extract text, identify risk clauses, and build your dashboard.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="cool-button mt-6"
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
