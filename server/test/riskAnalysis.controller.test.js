import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import aiRiskAnalysisService from "../src/services/aiRiskAnalysis.service.js";
import contractsRouter from "../src/routes/contracts.routes.js";
import { analyzeAndPersistContractRisks, isValidFinding } from "../src/controllers/riskAnalysis.controller.js";
import { requireAuth } from "../src/middleware/auth.js";
import { companyScope } from "../src/middleware/companyScope.js";

const contractId = "c4a6f51e-f659-44a8-a696-1529fbcc63b1";
const documentId = "d3b6f51e-f659-44a8-a696-1529fbcc63b1";
const companyId = "b2c6f51e-f659-44a8-a696-1529fbcc63b1";
const finding = {
  category: "LIABILITY",
  severity: "HIGH",
  title: "Unlimited liability exposure",
  description: "Potentially significant exposure requires review.",
  evidence: "The Customer shall have unlimited liability.",
  sourceChunks: [2, 3],
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const ownerRow = {
  contract_id: contractId,
  company_id: companyId,
  contract_name: "Example contract",
  document_id: documentId,
  review_id: "review-1",
};

const makeRequest = (role = "ADMIN") => ({
  params: { id: contractId },
  companyId,
  userId: role === "REVIEWER" ? "reviewer-1" : "admin-1",
  userRole: role,
});

const makeClient = (calls, { failInsert = false } = {}) => ({
  async query(sql, params) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: normalized, params });
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
    if (normalized.startsWith("SELECT c.id AS contract_id")) return { rows: [ownerRow] };
    if (normalized.startsWith("INSERT INTO risk_findings")) {
      if (failInsert) throw new Error("synthetic database failure");
      return {
        rows: [{
          id: "finding-1",
          contract_id: contractId,
          review_id: "review-1",
          risk_level: "HIGH",
          title: finding.title,
          reason: "[LIABILITY] Potentially significant exposure requires review.",
          evidence: finding.evidence,
          status: "PENDING",
          created_at: new Date(),
          updated_at: new Date(),
        }],
      };
    }
    return { rows: [] };
  },
  release() {},
});

test("authorized risk analysis uses the database document ID and persists mapped findings transactionally", async (t) => {
  const calls = [];
  t.mock.method(pool, "query", async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    return { rows: [ownerRow] };
  });
  t.mock.method(pool, "connect", async () => makeClient(calls));
  let analyzerDocumentId;
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async (id) => {
    analyzerDocumentId = id;
    return { documentId: id, findings: [finding] };
  });

  const response = makeResponse();
  let nextError;
  await analyzeAndPersistContractRisks(makeRequest(), response, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 200);
  assert.equal(analyzerDocumentId, documentId);
  assert.equal(response.body.findingCount, 1);
  const insert = calls.find(({ sql }) => sql.startsWith("INSERT INTO risk_findings"));
  assert.ok(insert);
  assert.match(insert.sql, /contract_id, review_id, risk_level, title, reason, evidence, status/);
  assert.match(insert.sql, /'PENDING'::finding_status/);
  assert.match(insert.sql, /WHERE NOT EXISTS/);
  assert.deepEqual(insert.params, [
    contractId,
    "review-1",
    "HIGH",
    finding.title,
    "[LIABILITY] Potentially significant exposure requires review.",
    finding.evidence,
  ]);
  assert.ok(calls.some(({ sql }) => sql === "BEGIN"));
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
  assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO audit_logs")));
  assert.ok(!calls.some(({ sql }) => /\bDELETE\s+FROM\s+risk_findings|UPDATE\s+risk_findings/i.test(sql)));
});

test("reviewer analysis query is company scoped and restricted to assigned contracts", async (t) => {
  const calls = [];
  t.mock.method(pool, "query", async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [ownerRow] };
  });
  t.mock.method(pool, "connect", async () => makeClient(calls));
  let analyzed = false;
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async (id) => {
    analyzed = true;
    return { documentId: id, findings: [] };
  });
  const response = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest("REVIEWER"), response, (error) => { throw error; });

  assert.equal(response.statusCode, 200);
  assert.equal(analyzed, true);
  assert.deepEqual(calls[0].params, [contractId, companyId, "reviewer-1"]);
  assert.match(calls[0].sql, /c\.company_id = \$2/);
  assert.match(calls[0].sql, /c\.assigned_reviewer_id = \$3/);
});

test("re-analysis uses exact-finding idempotency and leaves existing reviewer decisions untouched", async (t) => {
  const calls = [];
  let persistedOnce = false;
  t.mock.method(pool, "query", async () => ({ rows: [ownerRow] }));
  t.mock.method(pool, "connect", async () => ({
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("SELECT c.id AS contract_id")) return { rows: [ownerRow] };
      if (normalized.startsWith("INSERT INTO risk_findings")) {
        if (persistedOnce) return { rows: [] }; // Existing row, including status, is retained.
        persistedOnce = true;
        return { rows: [{ id: "finding-1", status: "PENDING" }] };
      }
      return { rows: [] };
    },
    release() {},
  }));
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async (id) => ({ documentId: id, findings: [finding] }));

  const firstResponse = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest(), firstResponse, (error) => { throw error; });
  const secondResponse = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest(), secondResponse, (error) => { throw error; });

  assert.equal(firstResponse.body.findingCount, 1);
  assert.equal(firstResponse.body.insertedCount, 1);
  assert.equal(secondResponse.body.findingCount, 1);
  assert.equal(secondResponse.body.insertedCount, 0);
  assert.equal(persistedOnce, true);
  const insertSql = calls.filter(({ sql }) => sql.startsWith("INSERT INTO risk_findings"));
  assert.equal(insertSql.length, 2);
  assert.ok(insertSql.every(({ sql }) => /WHERE NOT EXISTS/.test(sql)));
  assert.ok(!calls.some(({ sql }) => /\bDELETE\s+FROM\s+risk_findings|UPDATE\s+risk_findings/i.test(sql)));
});

test("contract from another company is hidden and does not invoke AI", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [] }));
  let analyzed = false;
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async () => { analyzed = true; });
  const response = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest(), response, (error) => { throw error; });

  assert.equal(response.statusCode, 404);
  assert.equal(analyzed, false);
});

test("AI failure is safe and persists no findings", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [ownerRow] }));
  let connectCalled = false;
  t.mock.method(pool, "connect", async () => { connectCalled = true; throw new Error("unexpected"); });
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async () => {
    throw new Error("GROQ_API_KEY=secret raw provider failure");
  });
  const response = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest(), response, (error) => { throw error; });

  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /GROQ_API_KEY|secret|provider failure/);
  assert.equal(connectCalled, false);
});

test("invalid AI findings are rejected before any database write", async (t) => {
  t.mock.method(pool, "query", async () => ({ rows: [ownerRow] }));
  let connectCalled = false;
  t.mock.method(pool, "connect", async () => { connectCalled = true; });
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async (id) => ({
    documentId: id,
    findings: [{ ...finding, severity: "CRITICAL" }],
  }));
  const response = makeResponse();
  await analyzeAndPersistContractRisks(makeRequest(), response, (error) => { throw error; });

  assert.equal(response.statusCode, 502);
  assert.equal(connectCalled, false);
  assert.equal(isValidFinding({ ...finding, sourceChunks: ["fake"] }), false);
});

test("database persistence failure rolls back transaction", async (t) => {
  const calls = [];
  t.mock.method(pool, "query", async () => ({ rows: [ownerRow] }));
  t.mock.method(pool, "connect", async () => makeClient(calls, { failInsert: true }));
  t.mock.method(aiRiskAnalysisService, "analyzeContractRisks", async (id) => ({ documentId: id, findings: [finding] }));
  const response = makeResponse();
  let nextError;
  await analyzeAndPersistContractRisks(makeRequest(), response, (error) => { nextError = error; });

  assert.ok(nextError);
  assert.ok(calls.some(({ sql }) => sql === "BEGIN"));
  assert.ok(calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.ok(!calls.some(({ sql }) => sql === "COMMIT"));
});

test("risk analysis endpoint requires auth, company scope, and ADMIN or REVIEWER role", () => {
  const layer = contractsRouter.stack.find(
    (item) => item.route?.path === "/:id/analyze-risks" && item.route.methods.post,
  );
  assert.ok(layer);
  const handlers = layer.route.stack.map((item) => item.handle);
  assert.equal(handlers[0], requireAuth);
  assert.equal(handlers[1], companyScope);
  const response = makeResponse();
  let passed = false;
  handlers[2]({ userRole: "UNAUTHORIZED" }, response, () => { passed = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(passed, false);
});
