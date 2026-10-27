const assert = require('node:assert/strict');
const { ingestContractDocument } = require('../src/document-ingestion');
const { searchRelevantChunks, ensureDocumentIdPayloadIndex } = require('../src/retriever');
const { createQdrantClient, ensureCollection, COLLECTION_NAME } = require('../src/qdrant');

const TEST_DOCUMENT_ID = '__test_phase6_ingestion__';
const TEST_TEXT = [
  'Payment terms: the customer must pay each undisputed invoice within twenty-one days after receipt.',
  'Termination: either party may terminate this agreement by providing forty-five days written notice.',
  'Confidentiality: each party must protect confidential information during the agreement and for four years after it ends.',
  'Governing law: this agreement is governed by the laws of the State of Oregon.',
  'Notices must be delivered in writing to the addresses stated in the signature section. Each party will keep a record of notices received.',
  'Any amendment must be written and signed by authorized representatives of both parties. Neither party may transfer this agreement without written consent.',
].join(' ');

function createTinyPdf(text) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && `${line} ${word}`.length > 78) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);

  const escapePdfText = (value) =>
    value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const textOperations = lines
    .map((value, index) => `${index === 0 ? '' : 'T* '}(${escapePdfText(value)}) Tj`)
    .join(' ');
  const stream = `BT /F1 10 Tf 14 TL 40 760 Td ${textOperations} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}

async function getDocumentPoints(client) {
  const points = [];
  let offset;
  do {
    const page = await client.scroll(COLLECTION_NAME, {
      limit: 100,
      offset,
      filter: { must: [{ key: 'document_id', match: { value: TEST_DOCUMENT_ID } }] },
      with_payload: true,
      with_vector: false,
    });
    points.push(...page.points);
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

async function cleanupTestPoints(client) {
  const existing = await getDocumentPoints(client);
  if (existing.length) {
    await client.delete(COLLECTION_NAME, {
      wait: true,
      points: existing.map((point) => point.id),
    });
  }

  const remaining = await getDocumentPoints(client);
  assert.equal(remaining.length, 0, 'no Phase 6 test points should remain');
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let failure;
  let failureStage = 'collection verification';
  let chunkCount = 0;

  try {
    await ensureCollection(client);
    await ensureDocumentIdPayloadIndex(client);
    collectionReady = true;

    const pdf = createTinyPdf(TEST_TEXT);
    failureStage = 'document ID validation';
    await assert.rejects(
      () => ingestContractDocument(pdf, { documentId: '   ', client }),
      /documentId is required/,
    );
    failureStage = 'invalid PDF validation';
    await assert.rejects(
      () => ingestContractDocument(Buffer.from('not a PDF'), { documentId: TEST_DOCUMENT_ID, client }),
      /does not appear to be a PDF/,
    );

    failureStage = 'first ingestion';
    const first = await ingestContractDocument(pdf, { documentId: TEST_DOCUMENT_ID, client });
    assert.ok(first.pageCount > 0);
    assert.ok(first.characterCount > 0);
    assert.ok(first.chunkCount > 0);
    chunkCount = first.chunkCount;

    const firstPoints = await getDocumentPoints(client);
    assert.equal(firstPoints.length, first.chunkCount);
    assert.ok(firstPoints.every((point) => point.payload?.document_id === TEST_DOCUMENT_ID));

    failureStage = 'retrieval verification';
    const retrievalChecks = [
      { query: 'What is the payment period?', expectedText: /twenty-one\s+days/i },
      { query: 'What is the termination notice?', expectedText: /forty-five\s+days/i },
      { query: 'What governing law applies?', expectedText: /State of\s+Oregon/i },
    ];
    for (const check of retrievalChecks) {
      failureStage = `retrieval verification: ${check.query}`;
      const results = await searchRelevantChunks(check.query, {
        documentId: TEST_DOCUMENT_ID,
        limit: 3,
        client,
      });
      assert.ok(results.length > 0, 'retrieval should return an ingested chunk');
      assert.ok(results.every((result) => result.documentId === TEST_DOCUMENT_ID));
      if (!results.some((result) => check.expectedText.test(result.text))) {
        const error = new Error('Expected fixture clause was not returned.');
        error.safeDetail = `Result count: ${results.length}; chunk indices: ${results.map((result) => result.chunkIndex).join(',')}; result character counts: ${results.map((result) => result.characterCount).join(',')}; indexed chunk count: ${first.chunkCount}; extracted fixture clause present: ${check.expectedText.test(TEST_TEXT)}.`;
        throw error;
      }
    }

    failureStage = 'idempotency verification';
    const second = await ingestContractDocument(pdf, { documentId: TEST_DOCUMENT_ID, client });
    assert.equal(second.chunkCount, first.chunkCount);
    const secondPoints = await getDocumentPoints(client);
    assert.equal(secondPoints.length, firstPoints.length, 're-ingestion must replace deterministic points');
    assert.deepEqual(
      secondPoints.map((point) => point.id).sort(),
      firstPoints.map((point) => point.id).sort(),
    );
  } catch (error) {
    failure = error;
  }

  if (collectionReady) {
    try {
      await cleanupTestPoints(client);
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

  console.log(`Ingestion tests passed: ${chunkCount} chunks indexed and retrieved; re-ingestion kept the same point count; all synthetic points removed and verified.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  console.error(`Ingestion test failed during ${error?.safeStage || 'pipeline operation'}${status}.${error?.safeDetail ? ` ${error.safeDetail}` : ''}`);
  process.exitCode = 1;
});
