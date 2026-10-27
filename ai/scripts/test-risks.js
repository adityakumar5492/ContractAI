const assert = require('node:assert/strict');
const {
  analyzeContractRisks,
  parseRiskJson,
  validateRiskFindings,
} = require('../src/risk-analyzer');
const { indexDocumentChunks } = require('../src/embedding-indexer');
const { ensureDocumentIdPayloadIndex } = require('../src/retriever');
const { createQdrantClient, ensureCollection, COLLECTION_NAME } = require('../src/qdrant');
const { RISK_SEVERITIES } = require('../src/risk.config');

const TEST_DOCUMENT_ID = '__test_phase8b_risks__';
const OTHER_TEST_DOCUMENT_ID = '__test_phase8b_risks_other__';
const SAFE_CLAUSE = 'Each party retains ownership of its own pre-existing intellectual property.';
const LOW_RISK_CLAUSE = 'A $1 administrative fee applies if the Customer pays an invoice after 5:00 p.m. local time on the due date.';
const TEST_DOCUMENTS = [
  {
    id: TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'The Customer shall have unlimited liability for all direct and indirect losses arising from this Agreement.' },
      { index: 1, text: 'The Supplier shall indemnify the Customer for any and all claims, losses, damages, costs and expenses without limitation.' },
      { index: 2, text: 'Either party may terminate this Agreement upon 30 days written notice.' },
      { index: 3, text: LOW_RISK_CLAUSE },
      { index: 4, text: SAFE_CLAUSE },
      { index: 5, text: 'Invoices are payable within 30 days after receipt.' },
    ],
  },
  {
    id: OTHER_TEST_DOCUMENT_ID,
    chunks: [
      { index: 0, text: 'North Star Analytics may suspend weekly status reports if the client is 20 days overdue.' },
      { index: 1, text: 'A late fee of 5 credits applies to each overdue report.' },
      { index: 2, text: 'Reports resume when the overdue amount is paid.' },
    ],
  },
];

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
      `no synthetic Phase 8B points should remain for ${document.id}`,
    );
  }
}

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function runValidatorChecks() {
  const clauses = [
    {
      type: 'LIABILITY',
      title: 'Unlimited liability',
      summary: 'Liability has no cap.',
      text: TEST_DOCUMENTS[0].chunks[0].text,
      sourceChunks: [0],
    },
    {
      type: 'LIABILITY',
      title: 'Uncapped exposure',
      summary: 'The same unlimited liability may expose the customer to broad losses.',
      text: TEST_DOCUMENTS[0].chunks[0].text,
      sourceChunks: [1],
    },
    {
      type: 'PAYMENT',
      title: 'Nominal administrative fee',
      summary: 'A small late fee may create minor administrative exposure.',
      text: TEST_DOCUMENTS[0].chunks[3].text,
      sourceChunks: [4],
    },
  ];
  const validFinding = {
    category: 'LIABILITY',
    severity: 'HIGH',
    title: 'Unlimited liability exposure',
    description: 'Potential risk: the uncapped obligation could create significant financial exposure and requires review.',
    evidence: 'The Customer shall have unlimited liability for all direct and indirect losses arising from this Agreement.',
    sourceChunks: [0],
  };

  assert.throws(() => parseRiskJson('{malformed'), /malformed JSON/);
  assert.throws(() => validateRiskFindings({ findings: [{ ...validFinding, severity: 'CRITICAL' }] }, clauses), /unsupported severity/);
  assert.throws(() => validateRiskFindings({ findings: [{ ...validFinding, category: 'ILLEGALITY' }] }, clauses), /unsupported category/);
  assert.throws(() => validateRiskFindings({ findings: [{ ...validFinding, evidence: '' }] }, clauses), /missing or invalid fields/);
  assert.throws(() => validateRiskFindings({ findings: [{ ...validFinding, sourceChunks: [99] }] }, clauses), /do not support/);
  assert.throws(() => validateRiskFindings({ findings: [{ ...validFinding, evidence: 'The agreement is illegal.' }] }, clauses), /not verbatim/);
  const lowFinding = validateRiskFindings({
    findings: [{
      category: 'PAYMENT',
      severity: 'LOW',
      title: 'Nominal administrative fee',
      description: 'Potential minor administrative concern.',
      evidence: LOW_RISK_CLAUSE,
      sourceChunks: [4],
    }],
  }, clauses);
  assert.equal(lowFinding[0].severity, 'LOW');

  const duplicate = validateRiskFindings({
    findings: [
      validFinding,
      { ...validFinding, title: 'Uncapped liability losses', sourceChunks: [1] },
    ],
  }, clauses);
  assert.equal(duplicate.length, 1, 'duplicate risk issues should be merged');
  assert.deepEqual(duplicate[0].sourceChunks, [0, 1]);
  assert.ok(RISK_SEVERITIES.includes(duplicate[0].severity));
}

async function main() {
  const client = createQdrantClient();
  let collectionReady = false;
  let failure;
  let failureStage = 'collection verification';
  let primaryFindingCount = 0;

  try {
    runValidatorChecks();
    await ensureCollection(client);
    await ensureDocumentIdPayloadIndex(client);
    collectionReady = true;
    await cleanupSyntheticDocuments(client);

    for (const document of TEST_DOCUMENTS) {
      failureStage = 'synthetic clause indexing';
      await indexDocumentChunks(client, document.id, document.chunks);
    }

    failureStage = 'document ID validation';
    await assert.rejects(() => analyzeContractRisks('  '), /documentId must be a non-empty string/);

    failureStage = 'primary risk analysis';
    const result = await analyzeContractRisks(TEST_DOCUMENT_ID, { limit: 8 });
    assert.equal(result.documentId, TEST_DOCUMENT_ID);
    assert.ok(Array.isArray(result.findings));
    assert.ok(result.findings.length > 0, 'synthetic risky clauses should produce findings');
    primaryFindingCount = result.findings.length;

    const categories = new Set(result.findings.map((finding) => finding.category));
    for (const expectedCategory of ['LIABILITY', 'INDEMNIFICATION', 'TERMINATION']) {
      assert.ok(categories.has(expectedCategory), `expected ${expectedCategory} finding`);
    }
    assert.ok(result.findings.every((finding) => RISK_SEVERITIES.includes(finding.severity)));

    const primaryPoints = await getDocumentPoints(client, TEST_DOCUMENT_ID);
    const primaryChunkIndexes = new Set(primaryPoints.map((point) => point.payload.chunk_index));
    for (const finding of result.findings) {
      assert.ok(finding.evidence.trim());
      assert.ok(TEST_DOCUMENTS[0].chunks.some((chunk) =>
        normalize(chunk.text).includes(normalize(finding.evidence)),
      ));
      assert.ok(finding.sourceChunks.length > 0);
      assert.ok(finding.sourceChunks.every((index) => primaryChunkIndexes.has(index)));
      assert.doesNotMatch(finding.description, /illegal|violates? the law|legally invalid/i);
    }

    const liabilityFinding = result.findings.find((finding) => finding.category === 'LIABILITY');
    const indemnityFinding = result.findings.find((finding) => finding.category === 'INDEMNIFICATION');
    const terminationFinding = result.findings.find((finding) => finding.category === 'TERMINATION');
    assert.equal(liabilityFinding.severity, 'HIGH');
    assert.equal(indemnityFinding.severity, 'HIGH');
    assert.ok(
      ['MEDIUM', 'LOW'].includes(terminationFinding.severity),
      'a mutual 30-day termination right may be a medium or limited concern depending on context',
    );

    const lowRiskFindings = result.findings.filter((finding) =>
      normalize(`${finding.evidence} ${finding.description}`).includes(normalize('$1 administrative fee')),
    );
    assert.ok(
      lowRiskFindings.every((finding) => finding.severity === 'LOW'),
      'a nominal administrative fee must not be overstated above LOW severity',
    );
    assert.ok(
      !result.findings.some((finding) => normalize(finding.evidence) === normalize(TEST_DOCUMENTS[0].chunks[4].text)),
      'a neutral IP ownership clause should not automatically become a finding',
    );

    failureStage = 'document isolation';
    const otherResult = await analyzeContractRisks(OTHER_TEST_DOCUMENT_ID, { limit: 8 });
    const otherPoints = await getDocumentPoints(client, OTHER_TEST_DOCUMENT_ID);
    const otherChunkIndexes = new Set(otherPoints.map((point) => point.payload.chunk_index));
    assert.ok(otherResult.findings.every((finding) =>
      finding.sourceChunks.every((index) => otherChunkIndexes.has(index)),
    ));
    assert.ok(otherResult.findings.every((finding) =>
      !/unlimited liability|indemnify the Customer|30 days written notice|pre-existing intellectual property/i.test(finding.evidence),
    ));
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

  console.log(`Risk tests passed: ${primaryFindingCount} primary findings validated, severity/category/grounding/deduplication checks passed, document isolation verified; all synthetic points removed and confirmed.`);
}

main().catch((error) => {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  console.error(`Risk analysis test failed during ${error?.safeStage || 'risk analysis'}${status}.${error?.safeDetail ? ` ${error.safeDetail}` : ''}`);
  process.exitCode = 1;
});
