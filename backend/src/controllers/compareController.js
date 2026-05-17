// POST /api/compare — side-by-side contract diff (spec §6 Contract Comparison).
// Expected payload: { documentA, documentB } → returns { differences[], addedRisks[], modifiedClauses[] }.

const express = require('express');

const router = express.Router();

router.post('/', (_req, res) => {
  res.status(501).json({
    error: 'compare not implemented',
    stage: 'diff-engine',
  });
});

module.exports = router;
