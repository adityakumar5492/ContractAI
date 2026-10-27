const { createQdrantClient, ensureCollection } = require('./qdrant');
const { extractPdfText } = require('./pdf-extractor');
const { chunkText } = require('./chunker');
const { indexDocumentChunks } = require('./embedding-indexer');

async function ingestContractDocument(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Ingestion options must be an object.');
  }
  if (typeof options.documentId !== 'string' || !options.documentId.trim()) {
    throw new Error('A non-empty documentId is required.');
  }

  const documentId = options.documentId.trim();
  const extracted = await extractPdfText(input);
  if (!extracted.text.trim() || extracted.characterCount === 0) {
    throw new Error('The PDF contains no text to ingest.');
  }

  let chunkResult;
  try {
    chunkResult = await chunkText(extracted.text);
  } catch {
    throw new Error('Unable to split the extracted PDF text into chunks.');
  }
  if (!chunkResult.chunks.length) {
    throw new Error('The PDF contains no chunks to ingest.');
  }

  const client = options.client || createQdrantClient();
  try {
    await ensureCollection(client);
  } catch {
    throw new Error('Unable to connect to the ContractAI Qdrant collection.');
  }

  try {
    await indexDocumentChunks(client, documentId, chunkResult.chunks);
  } catch {
    throw new Error('Unable to index the PDF chunks in Qdrant.');
  }

  return {
    documentId,
    pageCount: extracted.pageCount,
    characterCount: extracted.characterCount,
    chunkCount: chunkResult.totalChunks,
  };
}

module.exports = { ingestContractDocument };
