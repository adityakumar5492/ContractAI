const { createHash } = require('node:crypto');
const { COLLECTION_NAME, VECTOR_SIZE } = require('./qdrant');

const EMBEDDING_MODEL = 'sentence-transformers/all-minilm-l6-v2';

function deterministicPointId(documentId, chunkIndex) {
  const digest = createHash('sha256')
    .update(`contractai:point:v1:${documentId}:${chunkIndex}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  // Format the stable hash as a UUID accepted by Qdrant.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateInput(documentId, chunks) {
  if (typeof documentId !== 'string' || !documentId.trim()) {
    throw new Error('documentId must be a non-empty string.');
  }
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('At least one document chunk is required.');
  }

  let previousIndex = -1;
  for (const chunk of chunks) {
    if (!Number.isInteger(chunk?.index) || chunk.index < 0 || chunk.index <= previousIndex) {
      throw new Error('Chunks must have unique, increasing non-negative indices.');
    }
    if (typeof chunk.text !== 'string' || !chunk.text.trim()) {
      throw new Error(`Chunk ${chunk.index} must contain text.`);
    }
    previousIndex = chunk.index;
  }
}

function validateEmbedding(vector, chunkIndex) {
  if (!Array.isArray(vector) || vector.length !== VECTOR_SIZE) {
    throw new Error(`Embedding for chunk ${chunkIndex} must contain exactly ${VECTOR_SIZE} values.`);
  }
  if (!vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`Embedding for chunk ${chunkIndex} contains invalid vector values.`);
  }
}

/**
 * Uses Qdrant Cloud Inference on upsert, then reads the stored vectors back
 * because the REST API does not provide a standalone embedding-only endpoint.
 * This operation indexes the document and returns its validated vectors.
 */
async function indexDocumentChunks(client, documentId, chunks) {
  validateInput(documentId, chunks);

  const points = chunks.map((chunk) => ({
    id: deterministicPointId(documentId, chunk.index),
    vector: { text: chunk.text, model: EMBEDDING_MODEL },
    payload: {
      document_id: documentId,
      chunk_index: chunk.index,
      text: chunk.text,
      character_count: chunk.text.length,
    },
  }));

  await client.upsert(COLLECTION_NAME, { points, wait: true });
  const records = await client.retrieve(COLLECTION_NAME, {
    ids: points.map((point) => point.id),
    with_payload: true,
    with_vector: true,
  });

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const embeddings = chunks.map((chunk, position) => {
    const pointId = points[position].id;
    const record = recordsById.get(pointId);
    if (!record || record.payload?.document_id !== documentId || record.payload?.chunk_index !== chunk.index) {
      throw new Error(`Qdrant did not return the indexed point for chunk ${chunk.index}.`);
    }
    validateEmbedding(record.vector, chunk.index);
    return { chunkIndex: chunk.index, pointId, vector: record.vector };
  });

  return {
    documentId,
    model: EMBEDDING_MODEL,
    vectorSize: VECTOR_SIZE,
    indexedCount: points.length,
    embeddings,
  };
}

module.exports = {
  EMBEDDING_MODEL,
  deterministicPointId,
  indexDocumentChunks,
};
