class EmailConfigurationError extends Error {
  constructor() {
    super("Reviewer invitation email delivery is not configured");
    this.name = "EmailConfigurationError";
  }
}

class EmailDeliveryError extends Error {
  constructor() {
    super("Reviewer invitation email delivery failed");
    this.name = "EmailDeliveryError";
  }
}

const getEmailConfiguration = () => {
  const appUrl =
    process.env.APP_URL ||
    (process.env.NODE_ENV === "production"
      ? ""
      : process.env.CLIENT_URL || "http://localhost:5173");

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !appUrl) {
    throw new EmailConfigurationError();
  }

  let parsedAppUrl;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new EmailConfigurationError();
  }

  if (
    process.env.NODE_ENV === "production" &&
    parsedAppUrl.protocol !== "https:"
  ) {
    throw new EmailConfigurationError();
  }

  return {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    appUrl: parsedAppUrl,
  };
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const buildInvitationUrl = (appUrl, token) => {
  const invitationUrl = new URL("/accept-reviewer-invitation", appUrl);
  invitationUrl.hash = new URLSearchParams({ token }).toString();
  return invitationUrl.toString();
};

const assertConfigured = () => {
  getEmailConfiguration();
};

const sendReviewerInvitationEmail = async ({
  to,
  companyName,
  token,
  expiresAt,
}) => {
  const config = getEmailConfiguration();
  const invitationUrl = buildInvitationUrl(config.appUrl, token);
  const safeCompanyName = escapeHtml(companyName || "your company");
  const expiration = new Date(expiresAt).toUTCString();
  const subject = `You're invited to review contracts for ${companyName || "your company"}`;
  const text = [
    `You have been invited to join ${companyName || "your company"} on ContractAI as a contract reviewer.`,
    "",
    `Accept the invitation: ${invitationUrl}`,
    `This invitation expires on ${expiration}.`,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
  ].join("\n");
  const html = `
    <p>You have been invited to join <strong>${safeCompanyName}</strong> on ContractAI as a contract reviewer.</p>
    <p><a href="${escapeHtml(invitationUrl)}">Accept your invitation</a></p>
    <p>This invitation expires on ${escapeHtml(expiration)}.</p>
    <p>If you were not expecting this invitation, you can ignore this email.</p>
  `;

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new EmailDeliveryError();
  }

  if (!response.ok) {
    throw new EmailDeliveryError();
  }
};

export const emailService = {
  assertConfigured,
  sendReviewerInvitationEmail,
};

export { EmailConfigurationError };
