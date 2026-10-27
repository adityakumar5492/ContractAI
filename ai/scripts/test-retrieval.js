const assert = require('node:assert/strict');
const {
  deterministicPointId,
  indexDocumentChunks,
} = require('../src/embedding-indexer');
const { searchRelevantChunks } = require('../src/retriever');
const { createQdrantClient, ensureCollection, COLLECTION_NAME } = require('../src/qdrant');

const TEST_DOCUMENT_ID = '__test_phase4__';
const OTHER_TEST_DOCUMENT_ID = '__test_phase4_other__';
const TEST_DOCUMENTS = [
  {
    id: TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'Either party may terminate this agreement by giving thirty days written notice.' },
      { index: 1, text: 'Invoices are due within fifteen days after receipt, and overdue balances accrue interest.' },
      { index: 2, text: 'Each party must protect confidential information during the term and for five years afterward.' },
      { index: 3, text: 'Aggregate liability is capped at fees paid in the prior twelve months, excluding indirect damages.' },
      { index: 4, text: 'This agreement is governed by Delaware law, with disputes heard in Delaware courts.' },
    ],
  },
  {
    id: OTHER_TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'Either party may terminate this agreement by giving thirty days written notice.' },
    ],
  },
];

async function removeTestDocuments(client) {
  const ids = TEST_DOCUMENTS.flatMap(({ id, chunks }) =>
    chunks.map((chunk) => deterministicPointId(id, chunk.index)),
  );
  await client.delete(COLLECTION_NAME, { wait: true, points: ids });
  const remainingIds = await client.retrieve(COLLECTION_NAME, {
    ids,
    with_payload: true,
    with_vector: false,
  });
  assert.equal(remainingIds.length, 0, 'all deterministic test points should be deleted');

  let offset;
  do {
    const page = await client.scroll(COLLECTION_NAME, {
      limit: 256,
      offset,
      with_payload: ['document_id'],
      with_vector: false,
    });
    assert.ok(
      page.points.every((point) =>
        point.payload?.document_id !== TEST_DOCUMENT_ID &&
        point.payload?.document_id !== OTHER_TEST_DOCUMENT_ID,
      ),
      'no synthetic Phase 4 document points should remain',
    );
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let failure;
  let failureStage = 'collection verification';
  let queryCount = 0;

  try {
    await ensureCollection(client);
    collectionReady = true;

    for (const document of TEST_DOCUMENTS) {
      failureStage = 'synthetic document indexing';
      await indexDocumentChunks(client, document.id, document.chunks);
    }

    const scenarios = [
      { query: 'How much notice is needed to terminate?', expectedIndex: 0 },
      { query: 'When must an invoice be paid?', expectedIndex: 1 },
      { query: 'How long does confidentiality continue after the agreement ends?', expectedIndex: 2 },
      { query: 'What is the liability cap and are indirect damages excluded?', expectedIndex: 3 },
      { query: 'Which law governs disputes?', expectedIndex: 4 },
    ];

    for (const scenario of scenarios) {
      failureStage = 'filtered semantic retrieval';
      const results = await searchRelevantChunks(scenario.query, {
        documentId: TEST_DOCUMENT_ID,
        limit: 3,
        client,
      });
      assert.ok(results.length > 0, 'query should return relevant chunks');
      assert.ok(results.length <= 3, 'result count must respect limit');
      assert.equal(results[0].documentId, TEST_DOCUMENT_ID);
      assert.equal(results[0].chunkIndex, scenario.expectedIndex);
      assert.ok(results.every((result) => result.documentId === TEST_DOCUMENT_ID));
      assert.ok(results.every((result) => Number.isFinite(result.score)));
      queryCount += 1;
    }

    failureStage = 'document filter and result limit verification';
    const scopedResults = await searchRelevantChunks(
      'Which contract has thirty days written termination notice?',
      { documentId: TEST_DOCUMENT_ID, limit: 1, client },
    );
    assert.equal(scopedResults.length, 1, 'limit=1 should return at most one result');
    assert.equal(scopedResults[0].documentId, TEST_DOCUMENT_ID, 'document filter must exclude the other test document');
    assert.equal(typeof scopedResults[0].score, 'number', 'similarity score should be returned');
    queryCount += 1;
  } catch (error) {
    failure = error;
  }

  if (collectionReady) {
    try {
      await removeTestDocuments(client);
    } catch (error) {
      if (!failure) {
        failure = error;
        failureStage = 'synthetic point cleanup and verification';
      }
    }
  }

  if (failure) {
    failure.safeStage = failureStage;
    throw failure;
  }

  console.log(`Retrieval tests passed: ${queryCount} scoped queries; document filtering, result limits, similarity scores, and cleanup verified.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  const serverReason = error?.data?.status?.error;
  const safeReason = typeof serverReason === 'string'
    ? serverReason.replaceAll(process.env.QDRANT_API_KEY || '\0', '[redacted]').slice(0, 240)
    : '';
  console.error(`Retrieval test failed during ${error?.safeStage || 'Qdrant operation'}${status}.${safeReason ? ` ${safeReason}` : ''}`);
  process.exitCode = 1;
});
