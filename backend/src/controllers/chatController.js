// POST /api/chat — contextual Q&A over an analyzed document (spec §6 Contract Chat Assistant).
// Expected payload: { documentId, message, history? } → returns { reply, citations[] }.

const express = require('express');

const router = express.Router();

router.post('/', (_req, res) => {
  res.status(501).json({
    error: 'chat not implemented',
    stage: 'context-router',
  });
});

module.exports = router;
