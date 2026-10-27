import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";

import pool from "../src/config/db.js";
import {
  deletePolicy,
  getPolicies,
  getPolicyById,
  updatePolicyStatus,
  uploadPolicy,
} from "../src/controllers/policies.controller.js";

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("policy list is company scoped and returns database chunk counts without file paths", async (t) => {
  let queryCall;
  t.mock.method(pool, "query", async (sql, params) => {
    queryCall = { sql, params };
    return {
      rows: [{
        id: "policy-1",
        title: "Security Policy",
        description: "Company security rules",
        file_name: "security.pdf",
        file_key: "uploads/policies/private.pdf",
        is_active: true,
        chunk_count: 4,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-02T00:00:00.000Z",
      }],
    };
  });

  const response = makeResponse();
  await getPolicies({ companyId: "company-from-auth" }, response, (error) => { throw error; });

  assert.deepEqual(queryCall.params, ["company-from-auth"]);
  assert.match(queryCall.sql, /WHERE p\.company_id = \$1/);
  assert.equal(response.body.policies[0].chunkCount, 4);
  assert.equal(response.body.policies[0].status, "ACTIVE");
  assert.equal("fileKey" in response.body.policies[0], false);
  assert.equal(JSON.stringify(response.body).includes("private.pdf"), false);
});

test("policy upload requires a document before opening a database transaction", async () => {
  const response = makeResponse();
  let nextCalled = false;
  await uploadPolicy(
    { body: { title: "Policy" }, companyId: "company-auth", userId: "user-auth" },
    response,
    () => { nextCalled = true; },
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.message, "Policy PDF is required.");
  assert.equal(nextCalled, false);
});

test("policy upload derives company and creator from authenticated context and omits file key", async (t) => {
  const clientCalls = [];
  const createdPolicy = {
    id: "policy-created",
    title: "Retention Policy",
    description: "Retention rules",
    file_name: "retention.pdf",
    is_active: true,
    created_at: "2026-10-25T00:00:00.000Z",
    updated_at: "2026-10-25T00:00:00.000Z",
  };
  const client = {
    async query(sql, params = []) {
      clientCalls.push({ sql, params });
      if (sql.includes("INSERT INTO policies")) return { rows: [createdPolicy] };
      return { rows: [] };
    },
    release() {},
  };

  t.mock.method(fs, "mkdir", async () => {});
  t.mock.method(fs, "writeFile", async () => {});
  t.mock.method(fs, "unlink", async () => {});
  t.mock.method(pool, "connect", async () => client);

  const response = makeResponse();
  await uploadPolicy(
    {
      companyId: "company-from-auth",
      userId: "user-from-auth",
      body: { title: " Retention Policy ", description: " Retention rules ", companyId: "attacker", created_by: "attacker" },
      file: {
        originalname: "retention.pdf",
        mimetype: "application/pdf",
        size: 12,
        buffer: Buffer.from("%PDF-1.7"),
      },
    },
    response,
    (error) => { throw error; },
  );

  const insert = clientCalls.find((call) => call.sql.includes("INSERT INTO policies"));
  assert.deepEqual(insert.params.slice(0, 5), [
    "company-from-auth",
    "user-from-auth",
    "Retention Policy",
    "Retention rules",
    "retention.pdf",
  ]);
  assert.equal(clientCalls.at(-1).sql, "COMMIT");
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.policy.id, "policy-created");
  assert.equal(JSON.stringify(response.body).includes("fileKey"), false);
  assert.equal(JSON.stringify(response.body).includes("uploads/policies"), false);
});

test("policy details are company scoped and omit internal file storage fields", async (t) => {
  let queryCall;
  t.mock.method(pool, "query", async (sql, params) => {
    queryCall = { sql, params };
    return { rows: [{
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Security Policy",
      description: "Security rules",
      file_name: "security.pdf",
      file_key: "uploads/policies/secret.pdf",
      is_active: true,
      chunk_count: 3,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-02T00:00:00.000Z",
    }] };
  });
  const response = makeResponse();
  await getPolicyById({ params: { id: "550e8400-e29b-41d4-a716-446655440000" }, companyId: "company-auth" }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(queryCall.params, ["550e8400-e29b-41d4-a716-446655440000", "company-auth"]);
  assert.match(queryCall.sql, /p\.company_id = \$2/);
  assert.equal(response.body.policy.chunkCount, 3);
  assert.equal("fileKey" in response.body.policy, false);
  assert.equal(JSON.stringify(response.body).includes("secret.pdf"), false);
});

test("policy status requires a boolean and audits the company-scoped change", async (t) => {
  const calls = [];
  t.mock.method(pool, "connect", async () => ({
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("UPDATE policies")) return { rows: [{
        id: "550e8400-e29b-41d4-a716-446655440000", title: "Security Policy",
        description: null, file_name: "security.pdf", is_active: false,
        created_at: new Date(), updated_at: new Date(),
      }] };
      return { rows: [] };
    },
    release() {},
  }));
  const invalid = makeResponse();
  await updatePolicyStatus({ params: { id: "550e8400-e29b-41d4-a716-446655440000" }, body: { isActive: "false" } }, invalid, (error) => { throw error; });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.length, 0);

  const response = makeResponse();
  await updatePolicyStatus({
    params: { id: "550e8400-e29b-41d4-a716-446655440000" },
    body: { isActive: false }, companyId: "company-auth", userId: "admin-auth",
  }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.policy.isActive, false);
  const update = calls.find(({ sql }) => sql.startsWith("UPDATE policies"));
  assert.deepEqual(update.params, [false, "550e8400-e29b-41d4-a716-446655440000", "company-auth"]);
  assert.ok(calls.some(({ sql, params }) => sql.startsWith("INSERT INTO audit_logs") && params[2] === "POLICY_DEACTIVATED"));
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
});

test("policy deletion removes database row transactionally and cleans only its policy file", async (t) => {
  const calls = [];
  const filePath = `${process.cwd()}\\uploads\\policies\\stored-policy.pdf`;
  t.mock.method(fs, "realpath", async (value) => value);
  t.mock.method(fs, "lstat", async () => ({ isSymbolicLink: () => false }));
  t.mock.method(fs, "unlink", async (value) => { calls.push({ sql: "UNLINK", params: [value] }); });
  t.mock.method(pool, "connect", async () => ({
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("SELECT id, title, file_key FROM policies")) {
        return { rows: [{ id: params[0], title: "Security Policy", file_key: "uploads/policies/stored-policy.pdf" }] };
      }
      if (normalized.startsWith("SELECT 1 FROM policies")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  }));

  const response = makeResponse();
  await deletePolicy({
    params: { id: "550e8400-e29b-41d4-a716-446655440000" },
    companyId: "company-auth", userId: "admin-auth",
  }, response, (error) => { throw error; });

  assert.equal(response.statusCode, 200);
  assert.ok(calls.some(({ sql }) => sql.startsWith("DELETE FROM policies")));
  assert.ok(calls.some(({ sql }) => sql.startsWith("INSERT INTO audit_logs")));
  assert.ok(calls.some(({ sql }) => sql === "COMMIT"));
  assert.ok(calls.some(({ sql, params }) => sql === "UNLINK" && params[0] === filePath));
  assert.ok(!calls.some(({ sql }) => sql.startsWith("DELETE FROM policy_chunks")));
});

test("cross-company policy deletion returns 404 without deleting a PDF", async (t) => {
  let fileRemoved = false;
  t.mock.method(fs, "unlink", async () => { fileRemoved = true; });
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (["BEGIN", "ROLLBACK"].includes(normalized)) return { rows: [] };
      if (normalized.startsWith("SELECT id, title, file_key FROM policies")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  }));
  const response = makeResponse();
  await deletePolicy({ params: { id: "550e8400-e29b-41d4-a716-446655440000" }, companyId: "other-company", userId: "admin-auth" }, response, (error) => { throw error; });
  assert.equal(response.statusCode, 404);
  assert.equal(fileRemoved, false);
});
