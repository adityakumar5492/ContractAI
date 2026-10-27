const {
  EMBEDDING_MODEL,
} = require('./embedding-indexer');
const {
  COLLECTION_NAME,
  VECTOR_SIZE,
  createQdrantClient,
  ensureCollection,
} = require('./qdrant');
const { DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT } = require('./retrieval.config');

function validateSearchOptions(query, options) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query must be a non-empty string.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Search options must be an object.');
  }
  if (options.documentId !== undefined &&
      (typeof options.documentId !== 'string' || !options.documentId.trim())) {
    throw new Error('documentId must be a non-empty string when provided.');
  }

  const limit = options.limit ?? DEFAULT_RESULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_RESULT_LIMIT}.`);
  }

  const scoreThreshold = options.scoreThreshold;
  if (scoreThreshold !== undefined &&
      (typeof scoreThreshold !== 'number' || !Number.isFinite(scoreThreshold) || scoreThreshold < -1 || scoreThreshold > 1)) {
    throw new Error('scoreThreshold must be a finite cosine similarity value between -1 and 1.');
  }

  return { limit, scoreThreshold };
}

async function ensureDocumentIdPayloadIndex(client) {
  let collection = await client.getCollection(COLLECTION_NAME);
  const existingIndex = collection.payload_schema?.document_id;
  if (existingIndex) {
    if (existingIndex.data_type !== 'keyword') {
      throw new Error('The document_id payload index must use the keyword type.');
    }
    return;
  }

  try {
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'document_id',
      field_schema: 'keyword',
      wait: true,
    });
  } catch (createError) {
    // If another initializer created it concurrently, accept only the expected type.
    collection = await client.getCollection(COLLECTION_NAME);
    const concurrentIndex = collection.payload_schema?.document_id;
    if (concurrentIndex?.data_type !== 'keyword') {
      throw createError;
    }
  }
}

function toSearchResult(point) {
  const payload = point.payload;
  if (!payload || typeof payload.document_id !== 'string' ||
      !Number.isInteger(payload.chunk_index) || typeof payload.text !== 'string' ||
      typeof point.score !== 'number' || !Number.isFinite(point.score)) {
    return null;
  }

  return {
    documentId: payload.document_id,
    chunkIndex: payload.chunk_index,
    text: payload.text,
    score: point.score,
    characterCount: Number.isInteger(payload.character_count)
      ? payload.character_count
      : payload.text.length,
  };
}

/** Search Qdrant using Cloud Inference with the same model used for indexing. */
async function searchRelevantChunks(query, options = {}) {
  const { limit, scoreThreshold } = validateSearchOptions(query, options);
  const client = options.client || createQdrantClient();
  await ensureCollection(client);
  await ensureDocumentIdPayloadIndex(client);

  const filter = options.documentId
    ? { must: [{ key: 'document_id', match: { value: options.documentId } }] }
    : undefined;

  const response = await client.query(COLLECTION_NAME, {
    query: { text: query.trim(), model: EMBEDDING_MODEL },
    filter,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
  });

  // Qdrant Cloud validates the inferred query vector against the collection's
  // configured 384-dimension vector. Its query response does not expose that
  // transient vector for a separate client-side length check.
  return (response.points || []).map(toSearchResult).filter(Boolean);
}

module.exports = {
  searchRelevantChunks,
  ensureDocumentIdPayloadIndex,
  VECTOR_SIZE,
};
