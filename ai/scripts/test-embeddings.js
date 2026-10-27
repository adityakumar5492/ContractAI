const assert = require('node:assert/strict');
const {
  EMBEDDING_MODEL,
  deterministicPointId,
  indexDocumentChunks,
} = require('../src/embedding-indexer');
const { createQdrantClient, ensureCollection, COLLECTION_NAME, VECTOR_SIZE } = require('../src/qdrant');

const TEST_DOCUMENT_ID = '__test_phase3__';
const TEST_CHUNKS = [
  { index: 0, text: 'Fictional agreement: Northwind rents a blue lighthouse for one year.' },
  { index: 1, text: 'The fictional tenant pays monthly and gives thirty days notice.' },
  { index: 2, text: 'The fictional owner maintains the lighthouse roof and beacon.' },
];

async function removeTestPoints(client) {
  const testPointIds = TEST_CHUNKS.map((chunk) => deterministicPointId(TEST_DOCUMENT_ID, chunk.index));
  await client.delete(COLLECTION_NAME, {
    wait: true,
    points: testPointIds,
  });
  const remainingIds = await client.retrieve(COLLECTION_NAME, {
    ids: testPointIds,
    with_payload: true,
    with_vector: false,
  });
  assert.equal(remainingIds.length, 0, 'synthetic test points must be removed');

  // Verify the namespace itself is absent. A full scroll avoids requiring an
  // extra payload index just for test cleanup on strict-mode collections.
  let offset;
  do {
    const page = await client.scroll(COLLECTION_NAME, {
      limit: 256,
      offset,
      with_payload: ['document_id'],
      with_vector: false,
    });
    assert.ok(
      page.points.every((point) => point.payload?.document_id !== TEST_DOCUMENT_ID),
      'no synthetic Phase 3 document points should remain',
    );
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let stage = 'collection verification';
  let failure;
  let failureStage;
  let indexed;
  let resultCount = 0;
  try {
    await ensureCollection(client);
    collectionReady = true;

    assert.equal(
      deterministicPointId(TEST_DOCUMENT_ID, 1),
      deterministicPointId(TEST_DOCUMENT_ID, 1),
      'point IDs should be deterministic',
    );

    stage = 'Cloud Inference indexing/vector validation';
    indexed = await indexDocumentChunks(client, TEST_DOCUMENT_ID, TEST_CHUNKS);
    assert.equal(indexed.model, EMBEDDING_MODEL);
    assert.equal(indexed.vectorSize, VECTOR_SIZE);
    assert.equal(indexed.indexedCount, TEST_CHUNKS.length);
    assert.deepEqual(indexed.embeddings.map(({ chunkIndex }) => chunkIndex), [0, 1, 2]);
    assert.ok(indexed.embeddings.every(({ vector }) => vector.length === VECTOR_SIZE));

    stage = 'similarity search';
    const query = await client.query(COLLECTION_NAME, {
      query: { text: TEST_CHUNKS[0].text, model: EMBEDDING_MODEL },
      score_threshold: 0.99,
      limit: 10,
      with_payload: true,
    });
    const expectedPointId = deterministicPointId(TEST_DOCUMENT_ID, 0);
    assert.ok(
      query.points.some((point) => point.id === expectedPointId && point.payload?.document_id === TEST_DOCUMENT_ID),
      'similarity query should find the exact synthetic chunk',
    );
    resultCount = query.points.length;
  } catch (error) {
    failure = error;
    failureStage = stage;
  }

  if (collectionReady) {
    stage = 'synthetic point cleanup and verification';
    try {
      await removeTestPoints(client);
    } catch (error) {
      if (!failure) {
        failure = error;
        failureStage = stage;
      }
    }
  }

  if (failure) {
    failure.safeStage = failureStage;
    throw failure;
  }

  console.log(`Embedding/indexing test passed: ${indexed.indexedCount} synthetic chunks, ${VECTOR_SIZE}-dimension vectors, similarity search returned ${resultCount} result(s); test points removed and verified.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  // Show only a safe operation label and status; redact the configured key.
  const serverReason = error?.data?.status?.error;
  const safeReason = typeof serverReason === 'string'
    ? serverReason.replaceAll(process.env.QDRANT_API_KEY || '\0', '[redacted]').slice(0, 240)
    : '';
  console.error(`Embedding/indexing test failed during ${error?.safeStage || 'Qdrant operation'}${status}.${safeReason ? ` ${safeReason}` : ''}`);
  process.exitCode = 1;
});
