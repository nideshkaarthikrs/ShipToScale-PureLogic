// Schema guard for LLM JSON responses. Future home for zod / ajv enforcement.
// Expected analysis schema: { documentType, summary, risks[], importantTerms[], implications[], predatoryScore }.

function validateAnalysisSchema(_payload) {
  return { valid: true, errors: [] };
}

module.exports = { validateAnalysisSchema };
