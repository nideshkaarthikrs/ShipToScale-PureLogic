// POST /api/analyze         — placeholder (returns 501; superseded by /upload).
// POST /api/analyze/upload  — full ingestion pipeline: OCR → structuring → chunk preparation.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');

const ocrService = require('../services/ocrService');
const legalStructuringService = require('../services/legalStructuringService');
const embeddingPreparationService = require('../services/embeddingPreparationService');

const router = express.Router();

const ALLOWED_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
const UPLOAD_DEST = path.join(__dirname, '..', '..', 'uploads');

const upload = multer({
  dest: UPLOAD_DEST,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true);
    const err = new Error(`Unsupported file type: ${file.mimetype}`);
    err.code = 'UNSUPPORTED_MIME';
    cb(err);
  },
});

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (_) {
    // best-effort cleanup
  }
}

// Multer errors surface as `err.code === 'LIMIT_FILE_SIZE'` etc. We translate
// upload-time rejections to HTTP 415 / 400 before they hit the global handler.
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'UNSUPPORTED_MIME') {
      return res.status(415).json({
        error: 'unsupported_file_type',
        message: err.message,
        supported: Array.from(ALLOWED_MIMES),
      });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file_too_large', message: 'Max 20 MB per upload.' });
    }
    return res.status(400).json({ error: 'upload_failed', message: err.message });
  });
}

router.post('/', (_req, res) => {
  res.status(501).json({
    error: 'analyze not implemented',
    stage: 'extraction',
    hint: 'Use POST /api/analyze/upload for the active ingestion pipeline.',
  });
});

router.post('/upload', handleUpload, async (req, res) => {
  const startedAt = Date.now();
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'missing_file', message: 'Attach a file under the "file" form field.' });
  }

  try {
    const extraction = await ocrService.extract(file.path, file.mimetype);
    const rawText = extraction.text || '';

    const structuredContext = legalStructuringService.structure(rawText);
    const preparedChunks = embeddingPreparationService.prepare(rawText);

    const payload = {
      rawText,
      docType: structuredContext.docType,
      structuredContext,
      preparedChunks,
      processingTimeMs: Date.now() - startedAt,
      meta: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        engine: extraction.engine,
        pageCount: extraction.pageCount ?? null,
        ocrConfidence: extraction.confidence ?? null,
        warning: extraction.warning || null,
        chunkCount: preparedChunks.length,
      },
    };

    await safeUnlink(file.path);
    return res.json(payload);
  } catch (err) {
    await safeUnlink(file.path);
    if (err.code === 'PDF_ENCRYPTED') {
      return res.status(422).json({ error: 'pdf_encrypted', message: err.message });
    }
    if (err.code === 'PDF_PARSE_FAILED' || err.code === 'OCR_FAILED') {
      return res.status(422).json({ error: err.code.toLowerCase(), message: err.message });
    }
    if (err.code === 'UNSUPPORTED_MIME') {
      return res.status(415).json({ error: 'unsupported_file_type', message: err.message });
    }
    console.error('[analyze/upload] pipeline error:', err);
    return res.status(500).json({ error: 'pipeline_failure', message: err.message });
  }
});

module.exports = router;
