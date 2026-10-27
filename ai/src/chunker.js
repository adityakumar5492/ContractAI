const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { CHUNK_SIZE, CHUNK_OVERLAP } = require('./document.config');

async function chunkText(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Text to chunk must be a non-empty string.');
  }

  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? CHUNK_OVERLAP;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('chunkSize must be a positive integer.');
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be a non-negative integer smaller than chunkSize.');
  }

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
  const chunks = (await splitter.splitText(text))
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => ({
      index,
      text: chunk,
      characterCount: chunk.length,
    }));

  return {
    chunks,
    totalChunks: chunks.length,
    sourceCharacterCount: text.length,
  };
}

module.exports = { chunkText };
