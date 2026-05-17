// LLM service — structured JSON generation via Claude API (primary), per spec §9–§11.
// Apply specialized prompt variants based on documentType: legal | food | policy | insurance.

async function analyzeDocument(_text, _documentType) {
  throw new Error('llmService.analyzeDocument not implemented');
}

async function answerQuestion(_documentContext, _question) {
  throw new Error('llmService.answerQuestion not implemented');
}

module.exports = { analyzeDocument, answerQuestion };
