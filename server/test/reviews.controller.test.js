import assert from "node:assert/strict";
import test from "node:test";

import pool from "../src/config/db.js";
import {
  addFindingComment,
  buildRiskSummary,
  getContractReview,
  updateReview,
  updateFindingStatus,
} from "../src/controllers/reviews.controller.js";

const contractId = "c4a6f51e-f659-44a8-a696-1529fbcc63b1";
const findingId = "d3b6f51e-f659-44a8-a696-1529fbcc63b1";
const reviewId = "e4b6f51e-f659-44a8-a696-1529fbcc63b1";
const companyId = "b2c6f51e-f659-44a8-a696-1529fbcc63b1";
const reviewerId = "a1c6f51e-f659-44a8-a696-1529fbcc63b1";

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const makeRequest = (params = {}, body = {}) => ({
  params: { id: contractId, findingId, ...params },
  body,
  companyId,
  userId: reviewerId,
  userRole: "REVIEWER",
});

test("review read returns company-scoped findings and associated comments", async (t) => {
  const queries = [];
  t.mock.method(pool, "query", async (sql, params) => {
    const normalized = sql.replace(/\s+/g, " ");
    queries.push({ sql: normalized, params });
    if (normalized.includes("FROM contracts c")) {
      return { rows: [{
        contract_id: contractId,
        risk_score: null,
        risk_level: null,
        assigned_reviewer_id: reviewerId,
        reviewer_name: "Assigned Reviewer",
        reviewer_email: "reviewer@example.com",
        review_id: "review-1",
        review_status: "IN_PROGRESS",
        final_notes: "Review notes",
      }] };
    }
    if (normalized.includes("FROM risk_findings")) {
      return { rows: [{
        id: findingId, contract_id: contractId, review_id: "review-1",
        risk_level: "HIGH", title: "Broad liability", reason: "Potential exposure",
        evidence: "Unlimited liability", recommendation: "Review cap",
        page_number: 2, section: "Liability", status: "PENDING", created_at: new Date(),
      }] };
    }
    return { rows: [{ id: "comment-1", finding_id: findingId, reviewer_id: reviewerId, reviewer_name: "Assigned Reviewer", comment: "Please review", created_at: new Date() }] };
  });

  const response = makeResponse();
  await getContractReview(makeRequest(), response, (error) => { throw error; });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.review.status, "IN_PROGRESS");
  assert.equal(response.body.findings[0].evidence, "Unlimited liability");
  assert.equal(response.body.findings[0].comments[0].comment, "Please review");
  assert.deepEqual(response.body.riskSummary, {
    riskScore: null,
    riskLevel: null,
    totalFindings: 1,
    high: 1,
    medium: 0,
    low: 0,
    pending: 1,
    accepted: 0,
    dismissed: 0,
  });
  assert.match(queries[0].sql, /c\.company_id = \$2/);
  assert.match(queries[0].sql, /c\.assigned_reviewer_id = \$3/);
  assert.deepEqual(queries[0].params, [contractId, companyId, reviewerId]);
});

test("assigned reviewer can accept a pending finding transactionally and audit it", async (t) => {
  const calls = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") return { rows: [] };
      if (normalized.startsWith("SELECT f.id")) {
        return { rows: [{ id: findingId, contract_id: contractId, finding_status: "PENDING", title: "Broad liability", review_id: "review-1", review_status: "IN_PROGRESS" }] };
      }
      if (normalized.startsWith("UPDATE risk_findings")) return { rows: [{ id: findingId, status: "ACCEPTED", updated_at: new Date() }] };
      return { rows: [] };
    },
    release() {},
  }));

  const response = makeResponse();
  await updateFindingStatus(makeRequest({}, { status: "ACCEPTED" }), response, (error) => { throw error; });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.finding.status, "ACCEPTED");
  assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO audit_logs")));
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
});

test("finding updates reject wrong-company/unassigned findings and invalid transitions", async (t) => {
  let lockedFinding = null;
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN" || normalized === "ROLLBACK") return { rows: [] };
      if (normalized.startsWith("SELECT f.id")) return { rows: lockedFinding ? [lockedFinding] : [] };
      return { rows: [] };
    },
    release() {},
  }));
  const unauthorized = makeResponse();
  await updateFindingStatus(makeRequest({}, { status: "ACCEPTED" }), unauthorized, (error) => { throw error; });
  assert.equal(unauthorized.statusCode, 404);

  lockedFinding = { finding_status: "ACCEPTED", review_status: "COMPLETED" };
  const invalidTransition = makeResponse();
  await updateFindingStatus(makeRequest({}, { status: "DISMISSED" }), invalidTransition, (error) => { throw error; });
  assert.equal(invalidTransition.statusCode, 409);
});

test("empty reviewer comments are rejected before persistence", async () => {
  const response = makeResponse();
  await addFindingComment(makeRequest({}, { comment: "   " }), response, (error) => { throw error; });
  assert.equal(response.statusCode, 400);
});

test("assigned reviewer can add a comment with an audit record", async (t) => {
  const calls = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(normalized);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("SELECT f.id")) {
        return { rows: [{
          id: findingId, finding_status: "PENDING", title: "Broad liability",
          review_id: "review-1", review_status: "IN_PROGRESS",
        }] };
      }
      if (normalized.startsWith("INSERT INTO review_comments")) {
        return { rows: [{ id: "comment-1", finding_id: findingId, reviewer_id: reviewerId, comment: "Please review this term.", created_at: new Date() }] };
      }
      return { rows: [] };
    },
    release() {},
  }));

  const response = makeResponse();
  await addFindingComment(makeRequest({}, { comment: " Please review this term. " }), response, (error) => { throw error; });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.comment.comment, "Please review this term.");
  assert.ok(calls.some((sql) => sql.startsWith("INSERT INTO audit_logs")));
  assert.ok(calls.includes("COMMIT"));
});

test("review completion updates review and contract in one transaction", async (t) => {
  const calls = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(normalized);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("SELECT r.id")) {
        return { rows: [{
          id: reviewId, contract_id: contractId, reviewer_id: reviewerId,
          status: "IN_PROGRESS", final_notes: "Prior notes",
          company_id: companyId, assigned_reviewer_id: reviewerId,
          contract_name: "Vendor agreement",
        }] };
      }
      if (normalized.startsWith("UPDATE reviews")) {
        return { rows: [{
          id: reviewId, contract_id: contractId, reviewer_id: reviewerId,
          status: "COMPLETED", final_notes: "Reviewed and complete",
          completed_at: new Date(), updated_at: new Date(),
        }] };
      }
      return { rows: [] };
    },
    release() {},
  }));

  const response = makeResponse();
  await updateReview({
    params: { id: reviewId },
    body: { status: "COMPLETED", finalNotes: "Reviewed and complete" },
    companyId,
    userId: reviewerId,
    userRole: "REVIEWER",
  }, response, (error) => { throw error; });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.review.status, "COMPLETED");
  assert.equal(response.body.contractStatus, "COMPLETED");
  assert.ok(calls.some((sql) => sql.startsWith("UPDATE contracts SET status = $1::contract_status")));
  assert.ok(calls.some((sql) => sql.startsWith("INSERT INTO audit_logs")));
  assert.ok(calls.includes("COMMIT"));
});

test("risk summary counts severities and statuses without inventing missing scores", () => {
  const findings = [
    { risk_level: "HIGH", status: "PENDING" },
    { risk_level: "MEDIUM", status: "ACCEPTED" },
    { risk_level: "LOW", status: "DISMISSED" },
    { risk_level: "HIGH", status: "PENDING" },
  ];
  assert.deepEqual(buildRiskSummary({ risk_score: null, risk_level: null }, findings), {
    riskScore: null,
    riskLevel: null,
    totalFindings: 4,
    high: 2,
    medium: 1,
    low: 1,
    pending: 2,
    accepted: 1,
    dismissed: 1,
  });
  assert.equal(buildRiskSummary({ risk_score: 0, risk_level: "LOW" }, []).riskScore, 0);
  assert.equal(buildRiskSummary({ risk_score: 100, risk_level: "HIGH" }, []).riskScore, 100);
  assert.equal(buildRiskSummary({ risk_score: 101, risk_level: "UNKNOWN" }, []).riskScore, null);
  assert.equal(buildRiskSummary({}, []).totalFindings, 0);
});

test("risk summary read rejects invalid IDs and hides contracts outside the company/assignment scope", async (t) => {
  const invalidResponse = makeResponse();
  await getContractReview(makeRequest({ id: "not-a-uuid" }), invalidResponse, (error) => { throw error; });
  assert.equal(invalidResponse.statusCode, 404);

  const queries = [];
  t.mock.method(pool, "query", async (sql, params) => {
    queries.push({ sql: sql.replace(/\s+/g, " "), params });
    return { rows: [] };
  });
  const crossCompanyResponse = makeResponse();
  await getContractReview(makeRequest(), crossCompanyResponse, (error) => { throw error; });
  assert.equal(crossCompanyResponse.statusCode, 404);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /c\.company_id = \$2/);
  assert.match(queries[0].sql, /c\.assigned_reviewer_id = \$3/);
});
