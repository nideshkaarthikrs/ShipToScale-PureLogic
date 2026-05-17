// RAG service — in-memory JSON similarity matching against legal_knowledge.json (spec §12).
// Production swap target: Pinecone / ChromaDB / FAISS.

async function retrieveContext(_query, _topK = 5) {
  throw new Error('ragService.retrieveContext not implemented');
}

module.exports = { retrieveContext };
