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

/**
 * Stream a chat reply from POST /api/chat as Server-Sent Events.
 *
 * We don't use the browser `EventSource` API because it doesn't support POST
 * with a JSON body. Instead we issue a `fetch()` with `Accept: text/event-stream`,
 * read the body as a stream, and parse SSE frames manually.
 *
 * Frame types from the backend:
 *   • `event: grounding` — once at start, payload `{ precedentCount, riskCount, citedPrecedentIds }`
 *   • `event: chunk`     — repeated, payload `{ text }`
 *   • `event: done`      — once at end
 *   • `event: error`     — payload `{ message, code }` if anything fails
 *
 * @param {object} params
 * @param {string} params.userQuery
 * @param {object} params.uploadedDocumentContext  { rawText, structuredContext, risks }
 * @param {Array}  params.retrievedPrecedents
 * @param {Array}  params.conversationHistory       [{ role, content }, ...]
 * @param {(text: string) => void} params.onChunk
 * @param {(meta: object) => void} [params.onGrounding]
 * @param {() => void} [params.onDone]
 * @param {(err: { message, code }) => void} [params.onError]
 * @param {AbortSignal} [params.signal]
 */
export async function chatStream({
  userQuery,
  uploadedDocumentContext,
  retrievedPrecedents,
  conversationHistory,
  onChunk,
  onGrounding,
  onDone,
  onError,
  signal,
}) {
  let resp;
  try {
    resp = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({
        userQuery,
        uploadedDocumentContext,
        retrievedPrecedents,
        conversationHistory,
      }),
      signal,
    });
  } catch (err) {
    onError?.({ message: err.message, code: 'NETWORK' });
    return;
  }

  if (!resp.ok) {
    let body = null;
    try { body = await resp.json(); } catch (_) { /* ignore */ }
    onError?.({ message: body?.message || `Chat request failed (HTTP ${resp.status})`, code: 'HTTP' });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!eventLine || !dataLine) continue;
        const event = eventLine.slice(6).trim();
        const data = dataLine.slice(5).trim();

        let payload = {};
        try { payload = JSON.parse(data); } catch (_) { /* keep as empty */ }

        if (event === 'grounding') onGrounding?.(payload);
        else if (event === 'chunk') onChunk?.(payload.text || '');
        else if (event === 'done') { onDone?.(); return; }
        else if (event === 'error') { onError?.(payload); return; }
      }
    }
    onDone?.();
  } catch (err) {
    if (err.name !== 'AbortError') onError?.({ message: err.message, code: 'STREAM' });
  }
}
