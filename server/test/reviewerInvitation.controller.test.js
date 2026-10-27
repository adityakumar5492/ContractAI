import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { clerkClient } from "@clerk/express";

import pool from "../src/config/db.js";
import { emailService } from "../src/services/email.service.js";
import {
  acceptReviewerInvitation,
  createReviewerInvitation,
  getReviewerInvitations,
  resendReviewerInvitation,
  revokeReviewerInvitation,
} from "../src/controllers/reviewerInvitation.controller.js";
import { requireRole } from "../src/middleware/rbac.js";

const invitationId = "f2d3ea67-763e-4c47-a5be-2aa75daf6bcd";
const companyId = "company-from-auth-context";
const adminId = "admin-from-auth-context";
const clerkUserId = "user_clerk_test_123";
const priorHash = Buffer.alloc(32, 7);

const makeResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const makeClient = (queryHandler) => ({
  calls: [],
  async query(sql, values = []) {
    this.calls.push({ sql, values });
    return queryHandler(sql, values, this.calls);
  },
  release() {},
});

const mockEmailService = (t, implementation = async () => {}) => {
  const sent = [];
  t.mock.method(emailService, "assertConfigured", () => {});
  t.mock.method(emailService, "sendReviewerInvitationEmail", async (message) => {
    sent.push(message);
    return implementation(message);
  });
  return sent;
};

const mockClerkUser = (t, clerkUser) => {
  t.mock.method(clerkClient.users, "getUser", async (id) => {
    assert.equal(id, clerkUserId);
    return clerkUser;
  });
};

const invitationClerkUser = (email = "reviewer@example.com") => ({
  id: clerkUserId,
  firstName: "Taylor",
  lastName: "Reviewer",
  emailAddresses: [
    { emailAddress: email, verification: { status: "verified" } },
  ],
});

const makeAcceptanceRequest = (overrides = {}) =>
  makeRequest({
    body: { token: "a".repeat(43) },
    clerkUserId,
    ...overrides,
  });

const makeRequest = (overrides = {}) => ({
  body: { email: "  Reviewer@Example.com " },
  params: { id: invitationId },
  companyId,
  userId: adminId,
  userRole: "ADMIN",
  ...overrides,
});

const baseInvitation = (overrides = {}) => ({
  id: invitationId,
  invited_email: "reviewer@example.com",
  status: "PENDING",
  expires_at: new Date("2030-01-08T00:00:00.000Z"),
  accepted_at: null,
  revoked_at: null,
  created_at: new Date("2030-01-01T00:00:00.000Z"),
  updated_at: new Date("2030-01-01T00:00:00.000Z"),
  ...overrides,
});

const createSuccessClient = (t, emailImplementation) => {
  const auditRows = [];
  const sentEmails = mockEmailService(t, emailImplementation);
  const client = makeClient(async (sql, values) => {
    if (sql.includes("FROM companies")) {
      assert.deepEqual(values, [companyId]);
      return { rows: [{ name: "Test Company" }] };
    }

    if (sql.includes("FROM users")) {
      assert.equal(values[0], companyId);
      assert.equal(values[1], "reviewer@example.com");
      return { rows: [] };
    }

    if (sql.includes("UPDATE reviewer_invitations") && sql.includes("SET status = 'EXPIRED'")) {
      return { rows: [] };
    }

    if (sql.includes("SELECT id") && sql.includes("status = 'PENDING'")) {
      assert.equal(values[0], companyId);
      assert.equal(values[1], "reviewer@example.com");
      return { rows: [] };
    }

    if (sql.includes("INSERT INTO reviewer_invitations")) {
      assert.equal(values[0], companyId);
      assert.equal(values[1], adminId);
      assert.equal(values[2], "reviewer@example.com");
      assert.ok(Buffer.isBuffer(values[3]));
      assert.equal(values[3].length, 32);
      return { rows: [baseInvitation()] };
    }

    if (sql.includes("INSERT INTO audit_logs")) {
      auditRows.push(values);
      return { rows: [] };
    }

    if (sql.includes("SET status = 'REVOKED'")) {
      return { rows: [{ id: invitationId }] };
    }

    return { rows: [] };
  });

  t.mock.method(pool, "connect", async () => client);
  return { client, auditRows, sentEmails };
};

test("admin-context request creates an invitation and audits no token", async (t) => {
  const { client, auditRows, sentEmails } = createSuccessClient(t);
  const res = makeResponse();
  let nextError;

  await createReviewerInvitation(makeRequest(), res, (error) => {
    nextError = error;
  });

  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.invitation.id, invitationId);
  assert.equal(res.body.invitation.invited_email, "reviewer@example.com");
  assert.equal(JSON.stringify(res.body).includes("development"), false);
  assert.equal(JSON.stringify(res.body).includes("token"), false);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "reviewer@example.com");
  assert.equal(sentEmails[0].companyName, "Test Company");
  assert.equal(sentEmails[0].token.length, 43);

  const insert = client.calls.find((call) =>
    call.sql.includes("INSERT INTO reviewer_invitations"),
  );
  assert.deepEqual(
    insert.values[3],
    createHash("sha256").update(sentEmails[0].token).digest(),
  );
  assert.match(insert.sql, /INTERVAL '7 days'/);

  const auditMetadata = JSON.stringify(auditRows.map((row) => JSON.parse(row[4])));
  assert.equal(auditMetadata.includes(sentEmails[0].token), false);
  assert.equal(auditMetadata.includes(insert.values[3].toString("hex")), false);
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("non-admin role is rejected by the existing role middleware", () => {
  const res = makeResponse();
  let nextCalled = false;

  requireRole("ADMIN")(
    { userRole: "REVIEWER" },
    res,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("existing company user email is rejected", async (t) => {
  mockEmailService(t);
  const client = makeClient(async (sql, values) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    assert.ok(sql.includes("FROM users"));
    assert.deepEqual(values, [companyId, "reviewer@example.com"]);
    return { rows: [{ id: "existing-user" }] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await createReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 409);
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO reviewer_invitations")), false);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
});

test("duplicate unexpired pending invitation is rejected", async (t) => {
  mockEmailService(t);
  const client = makeClient(async (sql) => {
    if (sql.includes("FROM users")) return { rows: [] };
    if (sql.includes("UPDATE reviewer_invitations") && sql.includes("SET status = 'EXPIRED'")) return { rows: [] };
    if (sql.includes("SELECT id") && sql.includes("status = 'PENDING'")) {
      return { rows: [{ id: invitationId }] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await createReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 409);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO reviewer_invitations")), false);
});

test("list is company-scoped and does not select or expose token_hash", async (t) => {
  const client = {
    async query(sql, values) {
      assert.equal(values[0], companyId);
      assert.equal(sql.includes("token_hash"), false);
      return {
        rows: [baseInvitation({ status: "EXPIRED" })],
      };
    },
  };
  t.mock.method(pool, "query", client.query.bind(client));
  const res = makeResponse();

  await getReviewerInvitations(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.invitations.length, 1);
  assert.equal(JSON.stringify(res.body).includes("token_hash"), false);
  assert.equal(JSON.stringify(res.body).includes("development"), false);
});

test("cross-company resend cannot find or expose an invitation", async (t) => {
  mockEmailService(t);
  const client = makeClient(async (sql, values) => {
    if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    assert.ok(sql.includes("WHERE i.id = $1"));
    assert.ok(sql.includes("i.company_id = $2"));
    assert.deepEqual(values, [invitationId, companyId]);
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await resendReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 404);
  assert.equal(client.calls.some((call) => call.sql.includes("SET token_hash")), false);
});

test("resend replaces token hash and resets expiry without adding a row", async (t) => {
  const sentEmails = mockEmailService(t);
  let replacementHash;
  let auditMetadata;
  const client = makeClient(async (sql, values) => {
    if (sql.includes("SELECT i.id, i.invited_email, i.status")) {
      assert.deepEqual(values, [invitationId, companyId]);
      return { rows: [{ ...baseInvitation(), company_name: "Test Company", is_expired: false }] };
    }
    if (sql.includes("SET token_hash")) {
      replacementHash = values[0];
      assert.ok(Buffer.isBuffer(replacementHash));
      assert.equal(replacementHash.length, 32);
      assert.equal(values[1], invitationId);
      assert.equal(values[2], companyId);
      assert.match(sql, /INTERVAL '7 days'/);
      return { rows: [baseInvitation({ updated_at: new Date(), expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })] };
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      auditMetadata = values[4];
      return { rows: [] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await resendReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.invitation.id, invitationId);
  assert.notDeepEqual(replacementHash, priorHash);
  assert.deepEqual(
    replacementHash,
    createHash("sha256").update(sentEmails[0].token).digest(),
  );
  assert.equal(JSON.stringify(res.body).includes("token"), false);
  assert.equal(auditMetadata.includes(sentEmails[0].token), false);
  assert.equal(auditMetadata.includes(replacementHash.toString("hex")), false);
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO reviewer_invitations")), false);
});

test("pending invitation can be revoked without deleting its row", async (t) => {
  let auditMetadata;
  const client = makeClient(async (sql, values) => {
    if (sql.includes("SELECT id, invited_email, status")) {
      return { rows: [{ ...baseInvitation(), is_expired: false }] };
    }
    if (sql.includes("SET status = 'REVOKED'")) {
      assert.deepEqual(values, [invitationId, companyId]);
      return {
        rows: [baseInvitation({
          status: "REVOKED",
          revoked_at: new Date(),
          updated_at: new Date(),
        })],
      };
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      auditMetadata = values[4];
      return { rows: [] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await revokeReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.invitation.status, "REVOKED");
  assert.ok(res.body.invitation.revoked_at);
  assert.equal(client.calls.some((call) => /^\s*DELETE/i.test(call.sql)), false);
  assert.equal(auditMetadata.includes("token"), false);
});

test("non-pending invitations cannot be resent or revoked", async (t) => {
  for (const action of [resendReviewerInvitation, revokeReviewerInvitation]) {
    if (action === resendReviewerInvitation) mockEmailService(t);
    const client = makeClient(async (sql) => {
      if (sql.includes("SELECT i.id, i.invited_email, i.status") || sql.includes("SELECT id, invited_email, status")) {
        return { rows: [{ ...baseInvitation({ status: "ACCEPTED" }), is_expired: false }] };
      }
      return { rows: [] };
    });
    t.mock.method(pool, "connect", async () => client);
    const res = makeResponse();

    await action(makeRequest(), res, assert.fail);

    assert.equal(res.statusCode, 409);
    assert.equal(client.calls.some((call) => call.sql.includes("SET token_hash")), false);
    assert.equal(client.calls.some((call) => call.sql.includes("SET status = 'REVOKED'")), false);
    t.mock.restoreAll();
  }
});

test("expired pending invitation is marked expired and cannot be resent", async (t) => {
  mockEmailService(t);
  const client = makeClient(async (sql) => {
    if (sql.includes("SELECT i.id, i.invited_email, i.status")) {
      return { rows: [{ ...baseInvitation(), is_expired: true }] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await resendReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 410);
  assert.ok(client.calls.some((call) => call.sql.includes("SET status = 'EXPIRED'")));
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO audit_logs")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
});

test("authenticated verified Clerk user accepts invitation exactly once", async (t) => {
  mockClerkUser(t, invitationClerkUser());
  const auditRows = [];
  const reviewerId = "reviewer-db-user-id";
  const token = "a".repeat(43);
  const client = makeClient(async (sql, values) => {
    if (sql.includes("FROM reviewer_invitations")) {
      assert.deepEqual(values[0], createHash("sha256").update(token).digest());
      assert.ok(sql.includes("FOR UPDATE"));
      return {
        rows: [{
          id: invitationId,
          company_id: companyId,
          invited_by_user_id: adminId,
          invited_email: "reviewer@example.com",
          status: "PENDING",
          is_expired: false,
        }],
      };
    }
    if (sql.includes("FROM users") && sql.includes("clerk_user_id")) {
      return { rows: [] };
    }
    if (sql.includes("FROM users") && sql.includes("LOWER(BTRIM(email))")) {
      assert.deepEqual(values, [companyId, "reviewer@example.com"]);
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO users")) {
      assert.deepEqual(values, [companyId, clerkUserId, "reviewer@example.com", "Taylor Reviewer"]);
      assert.match(sql, /'REVIEWER'/);
      return {
        rows: [{
          id: reviewerId,
          company_id: companyId,
          clerk_user_id: clerkUserId,
          email: "reviewer@example.com",
          full_name: "Taylor Reviewer",
          role: "REVIEWER",
          is_active: true,
        }],
      };
    }
    if (sql.includes("UPDATE reviewer_invitations") && sql.includes("SET status = 'ACCEPTED'")) {
      assert.deepEqual(values, [reviewerId, invitationId]);
      return { rows: [{ id: invitationId, status: "ACCEPTED", accepted_at: new Date() }] };
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      auditRows.push(values);
      return { rows: [] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await acceptReviewerInvitation(makeAcceptanceRequest(), res, assert.fail);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.id, reviewerId);
  assert.equal(res.body.user.companyId, companyId);
  assert.equal(res.body.user.role, "REVIEWER");
  assert.equal(res.body.invitation.status, "ACCEPTED");
  assert.equal(JSON.stringify(auditRows).includes(token), false);
  assert.equal(client.calls.some((call) => call.sql === "COMMIT"), true);
});

test("Clerk verified email mismatch does not consume invitation", async (t) => {
  mockClerkUser(t, invitationClerkUser("different@example.com"));
  const client = makeClient(async (sql) => {
    if (sql.includes("FROM reviewer_invitations")) {
      return {
        rows: [{
          id: invitationId,
          company_id: companyId,
          invited_by_user_id: adminId,
          invited_email: "reviewer@example.com",
          status: "PENDING",
          is_expired: false,
        }],
      };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await acceptReviewerInvitation(makeAcceptanceRequest(), res, assert.fail);

  assert.equal(res.statusCode, 403);
  assert.ok(client.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(client.calls.some((call) => call.sql.includes("UPDATE reviewer_invitations")), false);
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO users")), false);
});

test("accepted invitation token cannot be reused", async (t) => {
  mockClerkUser(t, invitationClerkUser());
  const client = makeClient(async (sql) => {
    if (sql.includes("FROM reviewer_invitations")) {
      return {
        rows: [{
          id: invitationId,
          company_id: companyId,
          invited_email: "reviewer@example.com",
          status: "ACCEPTED",
          is_expired: false,
        }],
      };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await acceptReviewerInvitation(makeAcceptanceRequest(), res, assert.fail);

  assert.equal(res.statusCode, 410);
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO users")), false);
  assert.equal(client.calls.some((call) => call.sql === "ROLLBACK"), true);
});

test("same-company reviewer already linked to this Clerk identity is linked, not duplicated", async (t) => {
  mockClerkUser(t, invitationClerkUser());
  const reviewerId = "reviewer-existing-id";
  let userInsertCount = 0;
  const client = makeClient(async (sql) => {
    if (sql.includes("FROM reviewer_invitations")) {
      return {
        rows: [{
          id: invitationId,
          company_id: companyId,
          invited_email: "reviewer@example.com",
          status: "PENDING",
          is_expired: false,
        }],
      };
    }
    if (sql.includes("FROM users") && sql.includes("clerk_user_id")) {
      return {
        rows: [{
          id: reviewerId,
          company_id: companyId,
          email: "reviewer@example.com",
          full_name: "Existing Reviewer",
          role: "REVIEWER",
          is_active: true,
        }],
      };
    }
    if (sql.includes("INSERT INTO users")) userInsertCount += 1;
    if (sql.includes("UPDATE reviewer_invitations") && sql.includes("SET status = 'ACCEPTED'")) {
      return { rows: [{ id: invitationId, status: "ACCEPTED", accepted_at: new Date() }] };
    }
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => client);
  const res = makeResponse();

  await acceptReviewerInvitation(makeAcceptanceRequest(), res, assert.fail);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, reviewerId);
  assert.equal(userInsertCount, 0);
});

test("raw invitation token is sent by email but never returned or logged", async (t) => {
  const { auditRows, sentEmails } = createSuccessClient(t);
  const logged = [];
  t.mock.method(console, "log", (...args) => logged.push(args.join(" ")));
  t.mock.method(console, "error", (...args) => logged.push(args.join(" ")));
  const res = makeResponse();

  await createReviewerInvitation(makeRequest(), res, assert.fail);

  const token = sentEmails[0].token;
  assert.equal(JSON.stringify(res.body).includes(token), false);
  assert.equal(logged.some((line) => line.includes(token)), false);
  assert.equal(JSON.stringify(auditRows).includes(token), false);
});

test("failed email delivery revokes invitation without returning the raw token", async (t) => {
  const { client, auditRows } = createSuccessClient(t, async () => {
    throw new Error("provider error must not escape");
  });
  const res = makeResponse();

  await createReviewerInvitation(makeRequest(), res, assert.fail);

  assert.equal(res.statusCode, 502);
  assert.equal(JSON.stringify(res.body).includes("token"), false);
  assert.ok(client.calls.some((call) => call.sql.includes("SET status = 'REVOKED'")));
  assert.ok(client.calls.some((call) => call.sql === "COMMIT"));
  const actions = auditRows.map((row) => row[2]);
  assert.ok(actions.includes("REVIEWER_INVITATION_CREATED"));
  assert.ok(actions.includes("REVIEWER_INVITATION_DELIVERY_FAILED"));
});
