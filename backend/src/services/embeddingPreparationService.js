// Sliding-window chunker for downstream semantic similarity search.
// Defaults tuned for hackathon latency: 800-char windows with 150-char overlap → ~200 tokens/chunk, ~20% overlap.

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 150;
const MIN_CHUNK_CHARS = 40;

function normalize(text) {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .toLowerCase();
}

function sliceBoundary(text, target) {
  // Try to break on the nearest whitespace before `target` so chunks don't split mid-word.
  if (target >= text.length) return text.length;
  for (let i = target; i > target - 80 && i > 0; i--) {
    if (/\s/.test(text[i])) return i;
  }
  return target;
}

function prepare(rawText, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  if (overlap >= chunkSize) {
    throw new Error('embeddingPreparationService: overlap must be smaller than chunkSize');
  }

  const cleaned = (rawText || '').replace(/\r\n?/g, '\n').replace(/[\t\f\v]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (!cleaned) return [];

  const chunks = [];
  const step = chunkSize - overlap;
  let cursor = 0;
  let id = 0;

  while (cursor < cleaned.length) {
    const end = sliceBoundary(cleaned, cursor + chunkSize);
    const slice = cleaned.slice(cursor, end).trim();
    if (slice.length >= MIN_CHUNK_CHARS) {
      chunks.push({
        id: id++,
        text: slice,
        normalized: normalize(slice),
        startIdx: cursor,
        endIdx: end,
        charCount: slice.length,
      });
    }
    if (end >= cleaned.length) break;
    cursor = Math.max(cursor + step, end - overlap);
  }

  return chunks;
}

module.exports = {
  prepare,
  normalize,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
};
