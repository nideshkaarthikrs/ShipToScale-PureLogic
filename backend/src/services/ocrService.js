// OCR service.
//   PDFs    → pdfjs-dist (Mozilla) — reliable on modern PDFs.
//   Images  → tesseract.js — lazy worker; first call downloads the ~10 MB English language model.
// Note: pdf-parse@1.x ships an ancient bundled pdfjs (2018) that chokes on modern flate streams,
// so we use pdfjs-dist directly instead.

const fs = require('fs/promises');
const path = require('path');

const SUPPORTED_PDF_MIME = new Set(['application/pdf']);
const SUPPORTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);

let pdfjsPromise = null;
let tesseractWorkerPromise = null;

function isPdf(mimeType) {
  return SUPPORTED_PDF_MIME.has(mimeType);
}

function isImage(mimeType) {
  return SUPPORTED_IMAGE_MIME.has(mimeType);
}

function isSupported(mimeType) {
  return isPdf(mimeType) || isImage(mimeType);
}

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    tesseractWorkerPromise = createWorker('eng').catch((err) => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

async function extractFromPdf(buffer) {
  let pdfjs;
  try {
    pdfjs = await getPdfjs();
  } catch (err) {
    const e = new Error(`Failed to load PDF engine: ${err.message}`);
    e.code = 'PDF_ENGINE_LOAD_FAILED';
    throw e;
  }

  let doc;
  try {
    // pdfjs-dist 4.x requires a plain Uint8Array, not a Buffer (Buffer is a subclass but pdfjs rejects it).
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    doc = await pdfjs.getDocument({
      data,
      disableWorker: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const msg = (err && err.message) || '';
    if (err && err.name === 'PasswordException') {
      const e = new Error('PDF is password-protected or encrypted');
      e.code = 'PDF_ENCRYPTED';
      throw e;
    }
    if (/Invalid PDF structure/i.test(msg) || /XRef/i.test(msg)) {
      const e = new Error(`PDF appears corrupted: ${msg}`);
      e.code = 'PDF_PARSE_FAILED';
      throw e;
    }
    const e = new Error(`Failed to parse PDF: ${msg || 'unknown error'}`);
    e.code = 'PDF_PARSE_FAILED';
    throw e;
  }

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    } catch (err) {
      // Don't abort the whole document on a single bad page.
      pages.push('');
    }
  }
  await doc.cleanup();
  await doc.destroy();

  return {
    text: pages.join('\n').replace(/[ \t]+\n/g, '\n').trim(),
    pageCount: doc.numPages,
    engine: 'pdfjs-dist',
  };
}

async function extractFromImage(input) {
  try {
    const worker = await getTesseractWorker();
    const { data } = await worker.recognize(input);
    return {
      text: (data.text || '').trim(),
      confidence: data.confidence ?? null,
      engine: 'tesseract.js',
    };
  } catch (err) {
    const e = new Error(`OCR failed: ${(err && err.message) || 'unknown error'}`);
    e.code = 'OCR_FAILED';
    throw e;
  }
}

// Top-level dispatcher: routes a file path + MIME to the right engine and surfaces a
// `warning` field when a PDF yields no extractable text (likely scanned — caller may
// choose to rasterize pages and rerun through tesseract in a future iteration).
async function extract(filePath, mimeType) {
  if (!isSupported(mimeType)) {
    const e = new Error(`Unsupported MIME type: ${mimeType}`);
    e.code = 'UNSUPPORTED_MIME';
    throw e;
  }

  if (isPdf(mimeType)) {
    const buffer = await fs.readFile(filePath);
    const out = await extractFromPdf(buffer);
    if (!out.text) {
      out.warning = 'PDF yielded no extractable text — likely a scanned document. PDF→image rasterization fallback not yet implemented.';
    }
    return out;
  }

  return extractFromImage(path.resolve(filePath));
}

async function shutdown() {
  if (!tesseractWorkerPromise) return;
  try {
    const worker = await tesseractWorkerPromise;
    await worker.terminate();
  } catch (_) {
    // best-effort
  } finally {
    tesseractWorkerPromise = null;
  }
}

module.exports = {
  extract,
  extractFromPdf,
  extractFromImage,
  isSupported,
  isPdf,
  isImage,
  shutdown,
};
