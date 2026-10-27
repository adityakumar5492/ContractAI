import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

import pool from "../src/config/db.js";
import aiIngestionService from "../src/services/aiIngestion.service.js";
import { getContracts, uploadContract } from "../src/controllers/contracts.controller.js";
import contractsRouter from "../src/routes/contracts.routes.js";
import { requireAuth } from "../src/middleware/auth.js";
import { companyScope } from "../src/middleware/companyScope.js";

const contractRow = {
  id: "contract-1",
  contract_name: "Review contract",
  vendor_name: "Example vendor",
  status: "UNDER_REVIEW",
  risk_score: null,
  risk_level: null,
  assigned_reviewer_id: "reviewer-1",
  review_status: "IN_PROGRESS",
  reviewer_id: "reviewer-1",
  reviewer_full_name: "Test Reviewer",
  reviewer_email: "reviewer@example.com",
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("reviewer contract list filters by company and assigned reviewer and returns review status", async (t) => {
  let queryCall;
  t.mock.method(pool, "query", async (sql, params) => {
    queryCall = { sql, params };
    return { rows: [contractRow] };
  });

  const response = makeResponse();
  let nextError;
  await getContracts(
    { companyId: "company-1", userId: "reviewer-1", userRole: "REVIEWER" },
    response,
    (error) => { nextError = error; },
  );

  assert.equal(nextError, undefined);
  assert.deepEqual(queryCall.params, ["company-1", "reviewer-1"]);
  assert.match(queryCall.sql, /c\.company_id = \$1/);
  assert.match(queryCall.sql, /c\.assigned_reviewer_id = \$2/);
  assert.equal(response.body.contracts[0].reviewStatus, "IN_PROGRESS");
});

test("admin contract list remains company scoped without reviewer filtering", async (t) => {
  let queryCall;
  t.mock.method(pool, "query", async (sql, params) => {
    queryCall = { sql, params };
    return { rows: [contractRow] };
  });

  const response = makeResponse();
  await getContracts(
    { companyId: "company-1", userId: "admin-1", userRole: "ADMIN" },
    response,
    (error) => { throw error; },
  );

  assert.deepEqual(queryCall.params, ["company-1"]);
  assert.match(queryCall.sql, /c\.company_id = \$1/);
  assert.doesNotMatch(queryCall.sql, /c\.assigned_reviewer_id = \$2/);
  assert.equal(response.body.contracts[0].reviewStatus, "IN_PROGRESS");
});

const uploadContractRow = {
  id: "c4a6f51e-f659-44a8-a696-1529fbcc63b1",
  company_id: "b2c6f51e-f659-44a8-a696-1529fbcc63b1",
  uploaded_by: "a1c6f51e-f659-44a8-a696-1529fbcc63b1",
  contract_name: "Test contract",
  vendor_name: "Test vendor",
  description: null,
  status: "UPLOADED",
  risk_score: null,
  risk_level: null,
  assigned_reviewer_id: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const uploadDocumentRow = {
  id: "d3b6f51e-f659-44a8-a696-1529fbcc63b1",
  contract_id: uploadContractRow.id,
  file_name: "test.pdf",
  file_key: "uploads/contracts/test.pdf",
  file_url: null,
  mime_type: "application/pdf",
  file_size: 14,
  page_count: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

const createUploadDbClient = (calls) => ({
  async query(sql, params) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    calls.push({ sql: normalizedSql, params });
    if (normalizedSql === "BEGIN" || normalizedSql === "COMMIT" || normalizedSql === "ROLLBACK") {
      return { rows: [] };
    }
    if (normalizedSql.startsWith("INSERT INTO contracts")) {
      return { rows: [uploadContractRow] };
    }
    if (normalizedSql.startsWith("INSERT INTO contract_documents")) {
      return { rows: [uploadDocumentRow] };
    }
    return { rows: [] };
  },
  release() {},
});

const makeUploadRequest = () => ({
  companyId: uploadContractRow.company_id,
  userId: uploadContractRow.uploaded_by,
  userRole: "ADMIN",
  body: { contractName: "Test contract", vendorName: "Test vendor" },
  file: {
    buffer: Buffer.from("%PDF-1.4 test"),
    size: 14,
    originalname: "test.pdf",
    mimetype: "application/pdf",
  },
});

const stubUploadStorage = (t) => {
  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "writeFile", async () => {});
  return t.mock.method(fs, "unlink", async () => {});
};

test("authorized contract upload indexes the committed contract document ID", async (t) => {
  const unlink = stubUploadStorage(t);
  const calls = [];
  const databaseClient = createUploadDbClient(calls);
  t.mock.method(pool, "connect", async () => databaseClient);

  let ingestionCall;
  t.mock.method(aiIngestionService, "ingestContractDocument", async (input, options) => {
    ingestionCall = { input, options };
    return { documentId: options.documentId, pageCount: 1, characterCount: 10, chunkCount: 1 };
  });

  const response = makeResponse();
  let nextError;
  const req = makeUploadRequest();
  await uploadContract(req, response, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.contract.status, "UPLOADED");
  assert.equal(ingestionCall.input, req.file.buffer);
  assert.deepEqual(ingestionCall.options, { documentId: uploadDocumentRow.id });
  const contractInsert = calls.find(({ sql }) => sql.startsWith("INSERT INTO contracts"));
  assert.equal(contractInsert.params[0], req.companyId);
  assert.equal(contractInsert.params[1], req.userId);
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
});

test("AI ingestion failure returns a safe service error and preserves the committed upload", async (t) => {
  const unlink = stubUploadStorage(t);
  const calls = [];
  t.mock.method(pool, "connect", async () => createUploadDbClient(calls));
  t.mock.method(aiIngestionService, "ingestContractDocument", async () => {
    throw new Error("QDRANT_API_KEY=must-not-be-returned");
  });

  const response = makeResponse();
  let nextError;
  await uploadContract(makeUploadRequest(), response, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 503);
  assert.match(response.body.message, /uploaded, but document indexing failed/i);
  assert.doesNotMatch(JSON.stringify(response.body), /QDRANT_API_KEY|must-not-be-returned/);
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
  assert.ok(!calls.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(unlink.mock.callCount(), 0);
});

test("upload route requires authentication, company scope, and an allowed role before its controller", () => {
  const uploadRoute = contractsRouter.stack.find(
    (layer) => layer.route?.path === "/upload" && layer.route.methods.post,
  );
  assert.ok(uploadRoute);
  const handlers = uploadRoute.route.stack.map((layer) => layer.handle);
  assert.equal(handlers[0], requireAuth);
  assert.equal(handlers[1], companyScope);

  const roleGuard = handlers[2];
  const response = makeResponse();
  let passed = false;
  roleGuard({ userRole: "UNAUTHORIZED" }, response, () => { passed = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(passed, false);
  assert.equal(handlers.at(-1), uploadContract);
});

test("existing PDF signature validation rejects invalid files before AI ingestion", async (t) => {
  stubUploadStorage(t);
  let ingestionCalled = false;
  t.mock.method(aiIngestionService, "ingestContractDocument", async () => {
    ingestionCalled = true;
  });

  const response = makeResponse();
  let nextError;
  const req = makeUploadRequest();
  req.file.buffer = Buffer.from("not a PDF file");
  req.file.size = req.file.buffer.length;
  await uploadContract(req, response, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "Invalid PDF file");
  assert.equal(ingestionCalled, false);
});
