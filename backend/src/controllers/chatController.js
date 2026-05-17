// POST /api/chat — grounded conversational Q&A over an analyzed document.
//
// Accepts (per spec §3):
//   {
//     userQuery: string,
//     uploadedDocumentContext: { rawText, structuredContext?, risks? },
//     retrievedPrecedents: Array<{ id, title, court, year, similarityScore?,
//                                  judgmentSummary?, keyArguments? }>,
//     conversationHistory: Array<{ role: 'user'|'assistant', content: string }>
//   }
//
// Server is stateless — the client persists conversation history and resends
// the relevant trailing window on every turn.
//
// Two response modes:
//   • Default: Server-Sent Events stream (`Content-Type: text/event-stream`).
//     The frontend reads chunks as they arrive, producing the
//     "characters typing" UX. Why streaming: Claude takes 5–30s for a chat
//     response; without streaming the UI looks frozen.
//   • Opt-out: `?stream=0` returns a single JSON `{ answer, meta }` blob.
//     Useful for `curl` testing.
//
// If the LLM-augmented data isn't present in the request (e.g. uploader
// skipped the LLM via `?analyze=0`), we route through the same grounded
// services that powered the upload (`judgmentRetrievalService` + the
// caller-supplied risks) so the chat is never starved of context.

const express = require('express');

const llmService = require('../services/llmService');
const judgmentRetrievalService = require('../services/judgmentRetrievalService');
const riskEngine = require('../services/riskEngine');

const router = express.Router();

// Local JSON body parser — `/api/analyze/upload` is multipart so we keep the
// JSON parser scoped to this route, matching the pattern in analyzeController.
router.use(express.json({ limit: '2mb' }));

function badRequest(res, message) {
  return res.status(400).json({ error: 'bad_request', message });
}

router.post('/', async (req, res) => {
  const {
    userQuery,
    uploadedDocumentContext,
    retrievedPrecedents,
    conversationHistory,
  } = req.body || {};

  if (typeof userQuery !== 'string' || !userQuery.trim()) {
    return badRequest(res, 'userQuery is required.');
  }
  if (!uploadedDocumentContext || typeof uploadedDocumentContext !== 'object') {
    return badRequest(res, 'uploadedDocumentContext is required.');
  }

  const rawText = uploadedDocumentContext.rawText || uploadedDocumentContext.documentExcerpt || '';
  if (!rawText.trim()) {
    return badRequest(res, 'uploadedDocumentContext.rawText is empty — upload a document first.');
  }

  // Backfill grounded context if the client didn't pass it. This keeps the
  // chat endpoint useful even if the client is a curl test that only sent
  // rawText.
  let risks = Array.isArray(uploadedDocumentContext.risks) ? uploadedDocumentContext.risks : null;
  if (!risks) {
    try {
      risks = riskEngine.analyzeRisks(rawText, uploadedDocumentContext.structuredContext || {}).risks;
    } catch (_) {
      risks = [];
    }
  }

  let precedents = Array.isArray(retrievedPrecedents) ? retrievedPrecedents : null;
  if (!precedents) {
    try {
      precedents = await judgmentRetrievalService.retrieveSimilarJudgments(
        rawText,
        uploadedDocumentContext.structuredContext?.docType,
      );
    } catch (_) {
      precedents = [];
    }
  }

  const docCtx = {
    documentExcerpt: rawText,
    risks,
    precedents,
  };
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  // --- Non-streaming path (opt-in) ---------------------------------------
  if (req.query.stream === '0') {
    const result = await llmService.answerQuestion(docCtx, userQuery, { history });
    return res.json(result);
  }

  // --- SSE streaming path (default) --------------------------------------
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering when behind nginx
  });
  res.flushHeaders?.();

  // Tell the client what we grounded against, before the answer starts.
  // The client can use this to render precedent chips alongside the reply.
  const groundingMeta = {
    precedentCount: precedents.length,
    riskCount: risks.length,
    citedPrecedentIds: precedents.slice(0, 3).map((p) => p.id),
  };
  res.write(`event: grounding\ndata: ${JSON.stringify(groundingMeta)}\n\n`);

  // Client-disconnect detection. On Node 16+ `req.on('close')` fires as soon
  // as the request body has been fully read — *not* when the client gives up —
  // so we'd flip `aborted` true on the first turn and drop every chunk.
  // The reliable signal for an abandoned response is `res.on('close')` fired
  // while the response is still writable (i.e. before we called res.end()).
  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  await llmService.streamAnswer({
    question: userQuery,
    documentContext: docCtx,
    history,
    onChunk: (chunk) => {
      if (aborted) return;
      res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
    },
    onDone: () => {
      if (aborted) return;
      res.write('event: done\ndata: {}\n\n');
      res.end();
    },
    onError: (err) => {
      if (aborted) return;
      const payload = {
        message: err.code === 'LLM_NO_API_KEY'
          ? 'Chat is unavailable: server is missing ANTHROPIC_API_KEY.'
          : `Chat temporarily unavailable: ${err.message}`,
        code: err.code || 'LLM_ERROR',
      };
      res.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`);
      res.end();
    },
  });
});

module.exports = router;
