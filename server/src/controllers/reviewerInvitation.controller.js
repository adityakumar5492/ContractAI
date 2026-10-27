import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { clerkClient } from "@clerk/express";

import pool from "../config/db.js";
import { emailService } from "../services/email.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createInvitationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
  })
  .strict();

const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

const generateInvitationToken = () => {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest();

  return { token, tokenHash };
};

const writeInvitationAudit = async (
  client,
  {
    companyId,
    userId,
    invitationId,
    email,
    action,
    description,
    expiresAt,
    metadata = {},
  },
) => {
  await client.query(
    `
      INSERT INTO audit_logs (
        company_id,
        user_id,
        action,
        description,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      companyId,
      userId,
      action,
      description,
      JSON.stringify({
        invitationId,
        invitedEmail: email,
        ...(expiresAt ? { expiresAt } : {}),
        ...metadata,
      }),
    ],
  );
};

const markDeliveryFailure = async (
  client,
  { companyId, userId, invitationId, email, tokenHash },
) => {
  await client.query("BEGIN");
  try {
    const result = await client.query(
      `
        UPDATE reviewer_invitations
        SET status = 'REVOKED',
            revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'PENDING'
          AND token_hash = $3
        RETURNING id
      `,
      [invitationId, companyId, tokenHash],
    );

    if (result.rows.length > 0) {
      await writeInvitationAudit(client, {
        companyId,
        userId,
        invitationId,
        email,
        action: "REVIEWER_INVITATION_DELIVERY_FAILED",
        description: `Reviewer invitation delivery failed for ${email}; invitation was revoked`,
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error; the caller reports delivery failure.
    }
    throw error;
  }
};

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

export const createReviewerInvitation = async (req, res, next) => {
  const validation = createInvitationSchema.safeParse(req.body ?? {});

  if (!validation.success) {
    return sendError(res, 400, "A valid email address is required");
  }

  const email = validation.data.email;
  try {
    emailService.assertConfigured();
  } catch {
    return sendError(res, 503, "Reviewer invitation email delivery is not configured");
  }

  const { token, tokenHash } = generateInvitationToken();
  let client;
  let transactionStarted = false;
  let invitation;
  let companyName;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const existingUser = await client.query(
      `
        SELECT id
        FROM users
        WHERE company_id = $1
          AND LOWER(BTRIM(email)) = $2
        LIMIT 1
      `,
      [req.companyId, email],
    );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 409, "A user with this email already exists in your company");
    }

    const expiredInvitations = await client.query(
      `
        UPDATE reviewer_invitations
        SET status = 'EXPIRED',
            updated_at = NOW()
        WHERE company_id = $1
          AND invited_email = $2
          AND status = 'PENDING'
          AND expires_at <= NOW()
        RETURNING id
      `,
      [req.companyId, email],
    );

    for (const invitation of expiredInvitations.rows) {
      await writeInvitationAudit(client, {
        companyId: req.companyId,
        userId: req.userId,
        invitationId: invitation.id,
        email,
        action: "REVIEWER_INVITATION_EXPIRED",
        description: `Reviewer invitation for ${email} expired`,
      });
    }

    const pendingInvitation = await client.query(
      `
        SELECT id
        FROM reviewer_invitations
        WHERE company_id = $1
          AND invited_email = $2
          AND status = 'PENDING'
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE
      `,
      [req.companyId, email],
    );

    if (pendingInvitation.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 409, "A pending invitation already exists for this email");
    }

    const companyResult = await client.query(
      "SELECT name FROM companies WHERE id = $1 LIMIT 1",
      [req.companyId],
    );

    if (companyResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "Company not found");
    }

    companyName = companyResult.rows[0].name;

    const result = await client.query(
      `
        INSERT INTO reviewer_invitations (
          company_id,
          invited_by_user_id,
          invited_email,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')
        RETURNING
          id,
          invited_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_at,
          updated_at
      `,
      [req.companyId, req.userId, email, tokenHash],
    );

    invitation = result.rows[0];

    await writeInvitationAudit(client, {
      companyId: req.companyId,
      userId: req.userId,
      invitationId: invitation.id,
      email: invitation.invited_email,
      action: "REVIEWER_INVITATION_CREATED",
      description: `Reviewer invitation created for ${invitation.invited_email}`,
      expiresAt: invitation.expires_at,
    });

    await client.query("COMMIT");
    transactionStarted = false;

    try {
      await emailService.sendReviewerInvitationEmail({
        to: invitation.invited_email,
        companyName,
        token,
        expiresAt: invitation.expires_at,
      });
    } catch {
      await markDeliveryFailure(client, {
        companyId: req.companyId,
        userId: req.userId,
        invitationId: invitation.id,
        email: invitation.invited_email,
        tokenHash,
      });
      return sendError(
        res,
        502,
        "Invitation email could not be delivered. The invitation was revoked; create a new invitation to try again.",
      );
    }

    return res.status(201).json({
      success: true,
      invitation: {
        id: invitation.id,
        invited_email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at,
        accepted_at: invitation.accepted_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }

    if (error.code === "23505") {
      if (error.constraint === "users_company_email_lower_uniq") {
        return sendError(res, 409, "A user with this email already exists in your company");
      }

      if (error.constraint === "idx_reviewer_invitations_pending_email") {
        return sendError(res, 409, "A pending invitation already exists for this email");
      }
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
};

export const getReviewerInvitations = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          invited_email,
          CASE
            WHEN status = 'PENDING' AND expires_at <= NOW()
              THEN 'EXPIRED'
            ELSE status::TEXT
          END AS status,
          expires_at,
          accepted_at,
          revoked_at,
          created_at,
          updated_at
        FROM reviewer_invitations
        WHERE company_id = $1
        ORDER BY created_at DESC
      `,
      [req.companyId],
    );

    return res.status(200).json({
      success: true,
      invitations: result.rows.map((invitation) => ({
        id: invitation.id,
        invited_email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at,
        accepted_at: invitation.accepted_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const acceptReviewerInvitation = async (req, res, next) => {
  const validation = acceptInvitationSchema.safeParse(req.body ?? {});

  if (!validation.success) {
    return sendError(res, 400, "A valid invitation token is required");
  }

  let clerkUser;
  try {
    clerkUser = await clerkClient.users.getUser(req.clerkUserId);
  } catch {
    return sendError(res, 502, "Unable to verify your Clerk account right now");
  }

  const verifiedEmails = (clerkUser.emailAddresses || [])
    .filter((address) => address?.verification?.status === "verified")
    .map((address) => address.emailAddress?.trim().toLowerCase())
    .filter(Boolean);

  if (verifiedEmails.length === 0) {
    return sendError(res, 403, "A verified invited email is required to accept this invitation");
  }

  const nameParts = [clerkUser.firstName, clerkUser.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const fullName =
    nameParts ||
    clerkUser.fullName ||
    clerkUser.username ||
    verifiedEmails[0].split("@")[0];

  const tokenHash = createHash("sha256")
    .update(validation.data.token)
    .digest();
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const invitationResult = await client.query(
      `
        SELECT
          id,
          company_id,
          invited_by_user_id,
          invited_email,
          status,
          expires_at,
          expires_at <= NOW() AS is_expired
        FROM reviewer_invitations
        WHERE token_hash = $1
        FOR UPDATE
      `,
      [tokenHash],
    );

    if (invitationResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "Reviewer invitation not found");
    }

    const invitation = invitationResult.rows[0];

    if (invitation.status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 410, "Reviewer invitation is no longer valid");
    }

    if (invitation.is_expired) {
      await client.query(
        `
          UPDATE reviewer_invitations
          SET status = 'EXPIRED', updated_at = NOW()
          WHERE id = $1 AND status = 'PENDING'
        `,
        [invitation.id],
      );
      await writeInvitationAudit(client, {
        companyId: invitation.company_id,
        userId: invitation.invited_by_user_id,
        invitationId: invitation.id,
        email: invitation.invited_email,
        action: "REVIEWER_INVITATION_EXPIRED",
        description: `Reviewer invitation for ${invitation.invited_email} expired`,
      });
      await client.query("COMMIT");
      transactionStarted = false;
      return sendError(res, 410, "Reviewer invitation has expired");
    }

    if (!verifiedEmails.includes(invitation.invited_email)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(
        res,
        403,
        "The signed-in Clerk account does not have the verified invited email",
      );
    }

    const existingIdentityResult = await client.query(
      `
        SELECT id, company_id, email, full_name, role, is_active
        FROM users
        WHERE clerk_user_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [req.clerkUserId],
    );

    let reviewer;
    let created = false;

    if (existingIdentityResult.rows.length > 0) {
      reviewer = existingIdentityResult.rows[0];

      if (
        reviewer.company_id !== invitation.company_id ||
        reviewer.role !== "REVIEWER" ||
        reviewer.email.trim().toLowerCase() !== invitation.invited_email
      ) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return sendError(res, 409, "This Clerk account is already linked to another ContractAI user");
      }

      if (!reviewer.is_active) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return sendError(res, 403, "This reviewer account is inactive");
      }
    } else {
      const emailCollision = await client.query(
        `
          SELECT id
          FROM users
          WHERE company_id = $1
            AND LOWER(BTRIM(email)) = $2
          LIMIT 1
          FOR UPDATE
        `,
        [invitation.company_id, invitation.invited_email],
      );

      if (emailCollision.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return sendError(res, 409, "This email is already linked to a ContractAI user");
      }

      const reviewerResult = await client.query(
        `
          INSERT INTO users (
            company_id,
            clerk_user_id,
            email,
            full_name,
            role,
            is_active
          )
          VALUES ($1, $2, $3, $4, 'REVIEWER', true)
          RETURNING id, company_id, clerk_user_id, email, full_name, role, is_active
        `,
        [
          invitation.company_id,
          req.clerkUserId,
          invitation.invited_email,
          fullName,
        ],
      );

      reviewer = reviewerResult.rows[0];
      created = true;
    }

    const acceptedResult = await client.query(
      `
        UPDATE reviewer_invitations
        SET status = 'ACCEPTED',
            accepted_at = NOW(),
            accepted_user_id = $1,
            updated_at = NOW()
        WHERE id = $2
          AND status = 'PENDING'
        RETURNING id, status, accepted_at, updated_at
      `,
      [reviewer.id, invitation.id],
    );

    if (acceptedResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 410, "Reviewer invitation is no longer valid");
    }

    const acceptedInvitation = acceptedResult.rows[0];
    await writeInvitationAudit(client, {
      companyId: invitation.company_id,
      userId: reviewer.id,
      invitationId: invitation.id,
      email: invitation.invited_email,
      action: "REVIEWER_INVITATION_ACCEPTED",
      description: `Reviewer invitation for ${invitation.invited_email} was accepted`,
      metadata: { reviewerId: reviewer.id },
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(created ? 201 : 200).json({
      success: true,
      user: {
        id: reviewer.id,
        email: reviewer.email,
        fullName: reviewer.full_name,
        role: reviewer.role,
        isActive: reviewer.is_active,
        companyId: reviewer.company_id,
      },
      invitation: {
        id: acceptedInvitation.id,
        status: acceptedInvitation.status,
        acceptedAt: acceptedInvitation.accepted_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }

    if (error.code === "23505") {
      return sendError(res, 409, "This Clerk account or email is already linked to ContractAI");
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
};

export const resendReviewerInvitation = async (req, res, next) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(id)) {
    return sendError(res, 404, "Reviewer invitation not found");
  }

  try {
    emailService.assertConfigured();
  } catch {
    return sendError(res, 503, "Reviewer invitation email delivery is not configured");
  }

  const { token, tokenHash } = generateInvitationToken();
  let client;
  let transactionStarted = false;
  let invitation;
  let companyName;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const currentResult = await client.query(
      `
        SELECT i.id, i.invited_email, i.status, i.expires_at,
               c.name AS company_name,
               i.expires_at <= NOW() AS is_expired
        FROM reviewer_invitations i
        JOIN companies c ON c.id = i.company_id
        WHERE i.id = $1
          AND i.company_id = $2
        FOR UPDATE OF i
      `,
      [id, req.companyId],
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "Reviewer invitation not found");
    }

    const current = currentResult.rows[0];
    companyName = current.company_name;

    if (current.status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 409, "Only pending invitations can be resent");
    }

    if (current.is_expired) {
      await client.query(
        `
          UPDATE reviewer_invitations
          SET status = 'EXPIRED', updated_at = NOW()
          WHERE id = $1 AND company_id = $2
        `,
        [id, req.companyId],
      );
      await writeInvitationAudit(client, {
        companyId: req.companyId,
        userId: req.userId,
        invitationId: id,
        email: current.invited_email,
        action: "REVIEWER_INVITATION_EXPIRED",
        description: `Reviewer invitation for ${current.invited_email} expired`,
      });
      await client.query("COMMIT");
      transactionStarted = false;
      return sendError(res, 410, "Reviewer invitation has expired");
    }

    const result = await client.query(
      `
        UPDATE reviewer_invitations
        SET token_hash = $1,
            expires_at = NOW() + INTERVAL '7 days',
            updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
          AND status = 'PENDING'
        RETURNING
          id,
          invited_email,
          status,
          expires_at,
          accepted_at,
          revoked_at,
          created_at,
          updated_at
      `,
      [tokenHash, id, req.companyId],
    );

    invitation = result.rows[0];
    await writeInvitationAudit(client, {
      companyId: req.companyId,
      userId: req.userId,
      invitationId: invitation.id,
      email: invitation.invited_email,
      action: "REVIEWER_INVITATION_RESEND_REQUESTED",
      description: `Reviewer invitation resend requested for ${invitation.invited_email}`,
      expiresAt: invitation.expires_at,
    });

    await client.query("COMMIT");
    transactionStarted = false;

    try {
      await emailService.sendReviewerInvitationEmail({
        to: invitation.invited_email,
        companyName,
        token,
        expiresAt: invitation.expires_at,
      });
    } catch {
      await markDeliveryFailure(client, {
        companyId: req.companyId,
        userId: req.userId,
        invitationId: invitation.id,
        email: invitation.invited_email,
        tokenHash,
      });
      return sendError(
        res,
        502,
        "Invitation email could not be delivered. The invitation was revoked; create a new invitation to try again.",
      );
    }

    return res.status(200).json({
      success: true,
      invitation: {
        id: invitation.id,
        invited_email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at,
        accepted_at: invitation.accepted_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
};

export const revokeReviewerInvitation = async (req, res, next) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(id)) {
    return sendError(res, 404, "Reviewer invitation not found");
  }

  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const currentResult = await client.query(
      `
        SELECT id, invited_email, status, expires_at,
               expires_at <= NOW() AS is_expired
        FROM reviewer_invitations
        WHERE id = $1
          AND company_id = $2
        FOR UPDATE
      `,
      [id, req.companyId],
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 404, "Reviewer invitation not found");
    }

    const current = currentResult.rows[0];

    if (current.status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return sendError(res, 409, "Only pending invitations can be revoked");
    }

    if (current.is_expired) {
      await client.query(
        `
          UPDATE reviewer_invitations
          SET status = 'EXPIRED', updated_at = NOW()
          WHERE id = $1 AND company_id = $2
        `,
        [id, req.companyId],
      );
      await writeInvitationAudit(client, {
        companyId: req.companyId,
        userId: req.userId,
        invitationId: id,
        email: current.invited_email,
        action: "REVIEWER_INVITATION_EXPIRED",
        description: `Reviewer invitation for ${current.invited_email} expired`,
      });
      await client.query("COMMIT");
      transactionStarted = false;
      return sendError(res, 410, "Reviewer invitation has expired");
    }

    const result = await client.query(
      `
        UPDATE reviewer_invitations
        SET status = 'REVOKED',
            revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND status = 'PENDING'
        RETURNING id, invited_email, status, expires_at, revoked_at, updated_at
      `,
      [id, req.companyId],
    );

    const invitation = result.rows[0];
    await writeInvitationAudit(client, {
      companyId: req.companyId,
      userId: req.userId,
      invitationId: invitation.id,
      email: invitation.invited_email,
      action: "REVIEWER_INVITATION_REVOKED",
      description: `Reviewer invitation for ${invitation.invited_email} was revoked`,
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      invitation: {
        id: invitation.id,
        invited_email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at,
        revoked_at: invitation.revoked_at,
        updated_at: invitation.updated_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        return next(rollbackError);
      }
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
};
