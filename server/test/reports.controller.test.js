import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import reportsService from "../src/services/reports.service.js";
import reportsRouter from "../src/routes/reports.routes.js";
import { getReportsSummary } from "../src/controllers/reports.controller.js";
import { requireAuth } from "../src/middleware/auth.js";
import { companyScope } from "../src/middleware/companyScope.js";

const companyId = "6c513cf8-b32f-4edb-9456-c91e92057045";
const reviewerId = "f81095b6-0bdf-47ca-a2ef-b1aebbb2b570";

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const queryRowsFor = (sql) => {
  if (sql.includes("FROM contracts c")) {
    return [{
      total_contracts: 5,
      uploaded: 1,
      analyzing: 0,
      ai_analyzed: 1,
      under_review: 2,
      completed: 1,
      changes_requested: 1,
    }];
  }
  if (sql.includes("FROM risk_findings f") && sql.includes("COUNT(*)")) {
    return [{
      total_findings: 4,
      high_risk: 1,
      medium_risk: 2,
      low_risk: 1,
      pending: 2,
      accepted: 1,
      dismissed: 1,
    }];
  }
  if (sql.includes("FROM reviews r")) {
    return [{ total_reviews: 5, pending: 1, in_progress: 1, completed: 2, changes_requested: 1 }];
  }
  if (sql.includes("FROM risk_findings f")) {
    return [{
      id: "finding-1",
      contract_id: "contract-1",
      contract_name: "Vendor agreement",
      vendor_name: "Example Vendor",
      title: "Broad indemnity",
      risk_level: "HIGH",
      status: "PENDING",
      created_at: new Date("2026-01-12T10:00:00Z"),
    }];
  }
  throw new Error(`Unexpected query: ${sql}`);
};

const mockReportQueries = (t, calls) => {
  t.mock.method(pool, "query", async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    return { rows: queryRowsFor(sql) };
  });
};

test("ADMIN receives company-wide report metrics and recent persisted findings", async (t) => {
  const calls = [];
  mockReportQueries(t, calls);

  const response = makeResponse();
  let nextError;
  await getReportsSummary(
    { companyId, userId: "admin-1", userRole: "ADMIN" },
    response,
    (error) => { nextError = error; },
  );

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(response.body.data.summary, {
    totalContracts: 5,
    totalFindings: 4,
    highRiskFindings: 1,
    mediumRiskFindings: 2,
    lowRiskFindings: 1,
  });
  assert.deepEqual(response.body.data.findings, { pending: 2, accepted: 1, dismissed: 1 });
  assert.deepEqual(response.body.data.contracts, {
    uploaded: 1,
    analyzing: 0,
    aiAnalyzed: 1,
    underReview: 2,
    completed: 1,
    changesRequested: 1,
  });
  assert.deepEqual(response.body.data.reviews, {
    total: 5,
    pending: 1,
    inProgress: 1,
    completed: 2,
    changesRequested: 1,
  });
  assert.deepEqual(response.body.data.recentFindings, [{
    id: "finding-1",
    contractId: "contract-1",
    contractName: "Vendor agreement",
    vendorName: "Example Vendor",
    title: "Broad indemnity",
    riskLevel: "HIGH",
    status: "PENDING",
    createdAt: new Date("2026-01-12T10:00:00Z"),
  }]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ params, sql }) => {
    assert.deepEqual(params, [companyId]);
    return sql.includes("company_id = $1");
  }));
});

test("REVIEWER report queries are restricted to that user's assigned contracts", async (t) => {
  const calls = [];
  mockReportQueries(t, calls);

  const response = makeResponse();
  await getReportsSummary(
    { companyId, userId: reviewerId, userRole: "REVIEWER" },
    response,
    (error) => { throw error; },
  );

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 4);
  for (const { sql, params } of calls) {
    assert.deepEqual(params, [companyId, reviewerId]);
    assert.match(sql, /c\.company_id = \$1/);
    assert.match(sql, /c\.assigned_reviewer_id = \$2/);
  }
});

test("Reports endpoint requires Clerk auth, company scope, and ADMIN or REVIEWER role", () => {
  const layer = reportsRouter.stack.find(
    (item) => item.route?.path === "/summary" && item.route.methods.get,
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

test("database errors are passed through the shared safe error handler, not returned as report data", async (t) => {
  t.mock.method(reportsService, "getReportsSummary", async () => {
    throw new Error("sensitive database detail");
  });
  const response = makeResponse();
  let forwarded;
  await getReportsSummary(
    { companyId, userId: "admin-1", userRole: "ADMIN" },
    response,
    (error) => { forwarded = error; },
  );
  assert.equal(forwarded.message, "sensitive database detail");
  assert.equal(response.body, null);
});

test("empty company returns complete zero-valued metrics and an empty recent list", async (t) => {
  t.mock.method(pool, "query", async (sql) => ({
    rows: /SELECT\s+f\.id/.test(sql) ? [] : [{}],
  }));
  const result = await reportsService.getReportsSummary({
    companyId,
    userId: "admin-1",
    userRole: "ADMIN",
  });

  assert.deepEqual(result.summary, {
    totalContracts: 0,
    totalFindings: 0,
    highRiskFindings: 0,
    mediumRiskFindings: 0,
    lowRiskFindings: 0,
  });
  assert.deepEqual(result.findings, { pending: 0, accepted: 0, dismissed: 0 });
  assert.deepEqual(result.contracts, {
    uploaded: 0,
    analyzing: 0,
    aiAnalyzed: 0,
    underReview: 0,
    completed: 0,
    changesRequested: 0,
  });
  assert.deepEqual(result.reviews, {
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    changesRequested: 0,
  });
  assert.deepEqual(result.recentFindings, []);
});

test("independent aggregates prevent one-to-many joins from multiplying counts", async (t) => {
  const calls = [];
  mockReportQueries(t, calls);
  await reportsService.getReportsSummary({
    companyId,
    userId: "admin-1",
    userRole: "ADMIN",
  });

  assert.equal(calls.length, 4);
  const sql = calls.map(({ sql: query }) => query);
  assert.ok(sql.some((query) => /FROM contracts c/.test(query)));
  assert.ok(sql.some((query) => /FROM risk_findings f/.test(query) && /COUNT\(\*\)/.test(query)));
  assert.ok(sql.some((query) => /FROM reviews r/.test(query)));
  assert.ok(sql.every((query) => !(query.includes("FROM contracts c") && query.includes("FROM reviews r") && query.includes("FROM risk_findings f"))));
});
