import assert from "node:assert/strict";
import test from "node:test";

import { emailService } from "../src/services/email.service.js";

const configKeys = [
  "APP_URL",
  "CLIENT_URL",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "NODE_ENV",
];

const withEnvironment = (t, values) => {
  const previous = Object.fromEntries(
    configKeys.map((key) => [key, process.env[key]]),
  );

  for (const key of configKeys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }

  t.after(() => {
    for (const key of configKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
};

test("email service fails safely when delivery configuration is missing", (t) => {
  withEnvironment(t, {
    APP_URL: "",
    CLIENT_URL: "",
    EMAIL_FROM: "",
    RESEND_API_KEY: "",
    NODE_ENV: "development",
  });

  assert.throws(
    () => emailService.assertConfigured(),
    /email delivery is not configured/i,
  );
});

test("production email configuration requires an HTTPS app URL", (t) => {
  withEnvironment(t, {
    APP_URL: "http://contractai.example.test",
    EMAIL_FROM: "ContractAI <invites@example.test>",
    RESEND_API_KEY: "test-key-not-used",
    NODE_ENV: "production",
  });

  assert.throws(
    () => emailService.assertConfigured(),
    /email delivery is not configured/i,
  );
});

test("mailer sends invitation content through the provider without logging it", async (t) => {
  withEnvironment(t, {
    APP_URL: "https://contractai.example.test",
    EMAIL_FROM: "ContractAI <invites@example.test>",
    RESEND_API_KEY: "test-key-not-used",
    NODE_ENV: "production",
  });

  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    request = { url, options };
    return { ok: true };
  });

  await emailService.sendReviewerInvitationEmail({
    to: "reviewer@example.test",
    companyName: "Example Company",
    token: "secure-token-value",
    expiresAt: new Date("2030-01-08T12:00:00.000Z"),
  });

  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-key-not-used");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.to, ["reviewer@example.test"]);
  assert.match(body.text, /Example Company/);
  assert.match(body.text, /If you were not expecting this invitation/);
  assert.match(body.text, /expires on/);
  assert.match(body.text, /#token=secure-token-value/);
  assert.match(body.html, /Accept your invitation/);
});
