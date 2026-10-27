const assert = require('node:assert/strict');
const {
  generateRagAnswer,
} = require('../src/rag-generator');
const {
  deterministicPointId,
  indexDocumentChunks,
} = require('../src/embedding-indexer');
const { createQdrantClient, ensureCollection, COLLECTION_NAME } = require('../src/qdrant');
const { INSUFFICIENT_CONTEXT_ANSWER } = require('../src/rag.config');

const TEST_DOCUMENT_ID = '__test_phase5__';
const OTHER_TEST_DOCUMENT_ID = '__test_phase5_other__';
const TEST_DOCUMENTS = [
  {
    id: TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'The customer must pay each undisputed invoice within twenty days after receiving it.' },
      { index: 1, text: 'Either party may terminate this agreement by providing sixty days written notice.' },
      { index: 2, text: 'Each party must protect confidential information during the agreement and for three years after termination.' },
      { index: 3, text: 'This agreement is governed by the laws of the State of New York.' },
    ],
  },
  {
    id: OTHER_TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'This separate fictional contract renews automatically for ninety-nine years unless cancelled.' },
    ],
  },
];

async function removeTestDocuments(client) {
  const pointIds = TEST_DOCUMENTS.flatMap(({ id, chunks }) =>
    chunks.map((chunk) => deterministicPointId(id, chunk.index)),
  );
  await client.delete(COLLECTION_NAME, { wait: true, points: pointIds });
  const remainingById = await client.retrieve(COLLECTION_NAME, {
    ids: pointIds,
    with_payload: true,
    with_vector: false,
  });
  assert.equal(remainingById.length, 0, 'all deterministic Phase 5 points should be removed');

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
      'no synthetic Phase 5 points should remain',
    );
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let failure;
  let failureStage = 'collection verification';
  const checks = [];

  try {
    await ensureCollection(client);
    collectionReady = true;

    for (const document of TEST_DOCUMENTS) {
      failureStage = 'synthetic document indexing';
      await indexDocumentChunks(client, document.id, document.chunks);
    }

    const cases = [
      {
        name: 'payment period',
        query: 'What is the payment period for an undisputed invoice?',
        expectedChunk: 0,
      },
      {
        name: 'termination notice',
        query: 'How long is the termination notice?',
        expectedChunk: 1,
      },
      {
        name: 'governing law',
        query: 'What governing law applies?',
        expectedChunk: 3,
      },
    ];

    for (const testCase of cases) {
      failureStage = `Groq grounded answer: ${testCase.name}`;
      const result = await generateRagAnswer(testCase.query, {
        documentId: TEST_DOCUMENT_ID,
        limit: 4,
      });
      assert.equal(typeof result.answer, 'string');
      assert.ok(result.answer.trim().length > 0);
      assert.deepEqual(Object.keys(result).sort(), ['answer', 'sources']);
      assert.ok(result.sources.length > 0);
      assert.ok(result.sources.some((source) => source.chunkIndex === testCase.expectedChunk));
      assert.ok(result.sources.every((source) => source.documentId === TEST_DOCUMENT_ID));
      assert.ok(result.sources.every((source) =>
        source.text === TEST_DOCUMENTS[0].chunks[source.chunkIndex]?.text,
      ));
      assert.deepEqual(
        Object.keys(result.sources[0]).sort(),
        ['characterCount', 'chunkIndex', 'documentId', 'score', 'text'],
      );
      checks.push(testCase.name);
    }

    failureStage = 'missing-information answer';
    const missing = await generateRagAnswer('What is the automatic renewal period?', {
      documentId: TEST_DOCUMENT_ID,
      limit: 4,
      scoreThreshold: -1,
    });
    assert.ok(missing.sources.length > 0, 'missing-information test should provide contract context');
    assert.ok(
      /insufficient|not (?:specified|stated|provided|mentioned)|does not (?:state|specify|mention)|no information/i.test(missing.answer),
      'answer should acknowledge that renewal information is absent',
    );
    assert.ok(missing.sources.every((source) => source.documentId === TEST_DOCUMENT_ID));
    assert.ok(missing.sources.every((source) =>
      source.text === TEST_DOCUMENTS[0].chunks[source.chunkIndex]?.text,
    ));
    checks.push('insufficient-context response');
    assert.ok(missing.sources.every((source) => source.documentId !== OTHER_TEST_DOCUMENT_ID));
    checks.push('document ID scope');

    failureStage = 'empty retrieval handling';
    const empty = await generateRagAnswer('Describe any terms in this nonexistent document.', {
      documentId: '__test_phase5_missing__',
      limit: 3,
    });
    assert.deepEqual(empty, { answer: INSUFFICIENT_CONTEXT_ANSWER, sources: [] });
    checks.push('empty retrieval');
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

  console.log(`RAG tests passed: ${checks.length} checks (${checks.join(', ')}); synthetic points removed and verified.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  console.error(`RAG test failed during ${error?.safeStage || 'RAG operation'}${status}.`);
  process.exitCode = 1;
});
