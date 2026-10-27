const assert = require('node:assert/strict');
const {
  extractContractClauses,
  parseClauseJson,
  selectContextChunks,
  validateClauseOutput,
} = require('../src/clause-extractor');
const { ingestContractDocument } = require('../src/document-ingestion');
const { ensureDocumentIdPayloadIndex } = require('../src/retriever');
const { createQdrantClient, ensureCollection, COLLECTION_NAME } = require('../src/qdrant');

const TEST_DOCUMENT_ID = '__test_phase8_clauses__';
const OTHER_TEST_DOCUMENT_ID = '__test_phase8_clauses_other__';
const TEST_DOCUMENTS = [
  {
    id: TEST_DOCUMENT_ID,
    text: [
      'Company A and Company B enter into this Services Agreement, effective on the date of the last signature.',
      'Company B will pay each invoice within 30 days after receipt.',
      'Either party may terminate this Agreement with 30 days written notice.',
      'Each party must protect the other party\'s confidential information for 3 years after disclosure.',
      'This Agreement is governed by the laws of the State of Delaware.',
      'Each party retains ownership of its pre-existing intellectual property.',
    ].join(' '),
  },
  {
    id: OTHER_TEST_DOCUMENT_ID,
    text: [
      'Fictional Red LLC provides monthly status reports to Fictional Blue Inc.',
      'Fictional Blue Inc. pays a service fee of 17 credits within 10 days of each report.',
      'This separate fictional agreement is governed by the laws of the State of Oregon.',
    ].join(' '),
  },
];

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

async function getDocumentPoints(client, documentId) {
  const points = [];
  let offset;
  do {
    const page = await client.scroll(COLLECTION_NAME, {
      limit: 100,
      offset,
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
      with_payload: true,
      with_vector: false,
    });
    points.push(...page.points);
    offset = page.next_page_offset;
  } while (offset !== null && offset !== undefined);
  return points;
}

async function cleanupSyntheticDocuments(client) {
  for (const document of TEST_DOCUMENTS) {
    const points = await getDocumentPoints(client, document.id);
    if (points.length) {
      await client.delete(COLLECTION_NAME, {
        wait: true,
        points: points.map((point) => point.id),
      });
    }
  }

  for (const document of TEST_DOCUMENTS) {
    assert.equal(
      (await getDocumentPoints(client, document.id)).length,
      0,
      `no synthetic Phase 8 points should remain for ${document.id}`,
    );
  }
}

function normalize(value) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let failure;
  let failureStage = 'collection verification';
  let extractedCount = 0;

  try {
    assert.throws(() => parseClauseJson('{malformed'), /malformed JSON/);
    const localChunks = [{ documentId: 'local-test', chunkIndex: 2, text: 'Invoices are due within 10 days.', score: 0.8 }];
    assert.equal(selectContextChunks([...localChunks, ...localChunks]).length, 1);
    assert.throws(
      () => validateClauseOutput({ clauses: [{ type: 'RISK', title: 'Risk', summary: 'x', text: 'Invoices are due within 10 days.', sourceChunks: [2] }] }, localChunks),
      /unsupported type/,
    );
    assert.throws(
      () => validateClauseOutput({ clauses: [{ type: 'PAYMENT', title: 'Payment', summary: 'x', text: 'Invoices are due within 10 days.', sourceChunks: [9] }] }, localChunks),
      /source chunk references/,
    );
    assert.throws(
      () => validateClauseOutput({ clauses: [{ type: 'PAYMENT', title: 'Payment', summary: 'x', text: 'Invoices are due within 90 days.', sourceChunks: [2] }] }, localChunks),
      /not verbatim/,
    );

    await ensureCollection(client);
    await ensureDocumentIdPayloadIndex(client);
    collectionReady = true;
    await cleanupSyntheticDocuments(client);

    for (const document of TEST_DOCUMENTS) {
      failureStage = 'synthetic PDF ingestion';
      await ingestContractDocument(createTinyPdf(document.text), {
        documentId: document.id,
        client,
      });
    }

    failureStage = 'input validation';
    await assert.rejects(
      () => extractContractClauses('  '),
      /documentId must be a non-empty string/,
    );
    await assert.rejects(
      () => extractContractClauses(123),
      /documentId must be a non-empty string/,
    );

    failureStage = 'primary clause extraction';
    const result = await extractContractClauses(TEST_DOCUMENT_ID, { limit: 4 });
    assert.equal(result.documentId, TEST_DOCUMENT_ID);
    assert.ok(Array.isArray(result.clauses));
    extractedCount = result.clauses.length;

    const expectedGroundedClauses = [
      { type: 'PARTIES', pattern: /Company A|Company B/i },
      { type: 'PAYMENT', pattern: /30 days/i },
      { type: 'TERMINATION', pattern: /30 days/i },
      { type: 'CONFIDENTIALITY', pattern: /3 years/i },
      { type: 'GOVERNING_LAW', pattern: /Delaware/i },
      { type: 'INTELLECTUAL_PROPERTY', pattern: /pre-existing intellectual property/i },
    ];

    for (const expected of expectedGroundedClauses) {
      const clause = result.clauses.find((item) => item.type === expected.type);
      assert.ok(clause, `expected ${expected.type} to be extracted`);
      assert.match(`${clause.text} ${clause.summary}`, expected.pattern);
    }
    assert.ok(result.clauses.length >= expectedGroundedClauses.length);

    const primaryPoints = await getDocumentPoints(client, TEST_DOCUMENT_ID);
    const primaryChunkIndexes = new Set(primaryPoints.map((point) => point.payload.chunk_index));
    for (const clause of result.clauses) {
      assert.ok(Array.isArray(clause.sourceChunks) && clause.sourceChunks.length > 0);
      for (const index of clause.sourceChunks) {
        assert.ok(primaryChunkIndexes.has(index), `chunk ${index} must belong to the indexed synthetic document`);
      }
      const citedText = clause.sourceChunks
        .map((index) => primaryPoints.find((point) => point.payload.chunk_index === index).payload.text)
        .join(' ');
      assert.ok(
        normalize(citedText).includes(normalize(clause.text)),
        'extracted clause text must be grounded in the synthetic contract',
      );
    }

    failureStage = 'missing clause and document isolation checks';
    const otherResult = await extractContractClauses(OTHER_TEST_DOCUMENT_ID, { limit: 4 });
    assert.equal(otherResult.documentId, OTHER_TEST_DOCUMENT_ID);
    const otherPoints = await getDocumentPoints(client, OTHER_TEST_DOCUMENT_ID);
    const otherChunkIndexes = new Set(otherPoints.map((point) => point.payload.chunk_index));
    for (const clause of otherResult.clauses) {
      assert.ok(clause.sourceChunks.every((index) => otherChunkIndexes.has(index)));
      const content = `${clause.text} ${clause.summary}`;
      assert.doesNotMatch(content, /Company A|Company B|Delaware|30 days|3 years/i);
      const citedText = clause.sourceChunks
        .map((index) => otherPoints.find((point) => point.payload.chunk_index === index).payload.text)
        .join(' ');
      assert.ok(normalize(citedText).includes(normalize(clause.text)));
    }
    for (const missingType of ['TERMINATION', 'CONFIDENTIALITY', 'INDEMNIFICATION', 'INTELLECTUAL_PROPERTY']) {
      assert.ok(
        !otherResult.clauses.some((clause) => clause.type === missingType),
        `missing ${missingType} language must not be fabricated`,
      );
    }
  } catch (error) {
    failure = error;
    failure.safeDetail = error.message;
  }

  if (collectionReady) {
    try {
      await cleanupSyntheticDocuments(client);
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

  console.log(`Clause extraction tests passed: ${extractedCount} clauses validated, missing clauses omitted, document isolation verified; all synthetic points removed and confirmed.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  console.error(`Clause extraction test failed during ${error?.safeStage || 'clause extraction'}${status}.${error?.safeDetail ? ` ${error.safeDetail}` : ''}`);
  process.exitCode = 1;
});
