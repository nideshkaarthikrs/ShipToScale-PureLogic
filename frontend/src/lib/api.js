const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

export async function uploadDocument(file, { onProgress } = {}) {
  const formData = new FormData();
  formData.append('file', file);

  // fetch() doesn't expose upload progress; use XHR when a progress callback is supplied.
  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/analyze/upload`);
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) onProgress(evt.loaded / evt.total);
      };
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (_) { body = { raw: xhr.responseText }; }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
        reject(Object.assign(new Error(body?.message || `Upload failed (HTTP ${xhr.status})`), { status: xhr.status, body }));
      };
      xhr.onerror = () => reject(new Error('Network error while uploading'));
      xhr.send(formData);
    });
  }

  const res = await fetch(`${API_BASE}/api/analyze/upload`, { method: 'POST', body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.message || `Upload failed (HTTP ${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const ANALYSIS_STORAGE_KEY = 'civiclens.analysis.v1';
