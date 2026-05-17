// POST /api/analyze         — placeholder (returns 501; superseded by /upload).
// POST /api/analyze/upload  — full ingestion pipeline: OCR → structuring → chunk preparation.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');

const ocrService = require('../services/ocrService');
const legalStructuringService = require('../services/legalStructuringService');
const embeddingPreparationService = require('../services/embeddingPreparationService');
const llmService = require('../services/llmService');
const ragService = require('../services/ragService');

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

// Build the legal-intelligence layer (rag + llm) on top of an ingestion result.
// Pulled into a helper so /upload?analyze=1 and /api/analyze (no-file form)
// share the same orchestration logic.
async function runLegalIntelligence({ rawText, structuredContext }) {
  // Query for RAG combines the deterministic signals (allegations, violations,
  // dispute category) with a snippet of raw text. Pure rawText queries get
  // overwhelmed by boilerplate; pure structuredContext queries miss vocab.
  const queryPieces = [
    structuredContext?.disputeCategory,
    (structuredContext?.keyAllegations || []).join(' '),
    (structuredContext?.potentialViolations || []).join(' '),
    (structuredContext?.obligations || []).slice(0, 3).join(' '),
    (rawText || '').slice(0, 2000),
  ].filter(Boolean);

  const ragResult = await ragService.retrieveContext(queryPieces.join('\n'), {
    topK: 5,
    disputeDomain: structuredContext?.disputeCategory,
  });
  const winningArgumentRefs = ragService.extractWinningArguments(ragResult.matches);

  const { analysis, mode, meta } = await llmService.analyzeDocument(
    rawText,
    structuredContext?.docType,
    structuredContext,
    { retrievedJudgments: ragResult.matches, winningArgumentRefs },
  );

  return {
    analysis,
    rag: {
      mode,
      totalIndexed: ragResult.totalIndexed,
      byDomain: ragResult.byDomain,
      matchCount: ragResult.matches.length,
    },
    llmMeta: meta,
  };
}

// POST /api/analyze — JSON body { rawText, structuredContext } path. Used when
// the client has already uploaded and just wants the LLM layer (e.g., re-run
// after editing structuredContext). Fast-path; no file I/O.
router.post('/', express.json({ limit: '2mb' }), async (req, res) => {
  const { rawText, structuredContext } = req.body || {};
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: 'missing_rawText', message: 'Provide rawText in the JSON body.' });
  }
  try {
    const startedAt = Date.now();
    const intel = await runLegalIntelligence({ rawText, structuredContext: structuredContext || {} });
    return res.json({ ...intel, processingTimeMs: Date.now() - startedAt });
  } catch (err) {
    console.error('[analyze] legal-intelligence error:', err);
    return res.status(500).json({ error: 'analysis_failure', message: err.message });
  }
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

    // Run LLM + RAG by default. Caller can opt out with ?analyze=0 (useful
    // for diagnostics that only want extraction). Empty extractions skip the
    // LLM entirely — see schemaValidator.emptyAnalysisEnvelope for why.
    const wantsAnalysis = req.query.analyze !== '0' && req.body?.analyze !== '0';
    let intel = null;
    if (wantsAnalysis && rawText.trim()) {
      try {
        intel = await runLegalIntelligence({ rawText, structuredContext });
      } catch (err) {
        // Soft-fail: ingestion succeeded; surface analysis error in meta.
        console.error('[analyze/upload] legal-intelligence soft-fail:', err);
        intel = { analysis: null, rag: null, llmMeta: { ok: false, reason: 'LLM_PIPELINE', message: err.message } };
      }
    }

    const payload = {
      rawText,
      docType: structuredContext.docType,
      structuredContext,
      preparedChunks,
      // Legal-intelligence layer (Part 4). Always shape-correct or null.
      analysis: intel?.analysis || null,
      rag: intel?.rag || null,
      llmMeta: intel?.llmMeta || null,
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
