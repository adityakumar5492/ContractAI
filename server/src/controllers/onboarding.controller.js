import pool from "../config/db.js";
import { clerkClient } from "@clerk/express";
import { createCompanySchema } from "../validators/onboarding.validator.js";

const COMPANY_EXISTS_MESSAGE =
  "A company with this name already exists. Please contact the company admin for an invitation.";
const USER_EXISTS_MESSAGE = "You already have a ContractAI account";

const getVerifiedEmail = (clerkUser) => {
  const addresses = clerkUser.emailAddresses || [];
  const isVerified = (address) => address?.verification?.status === "verified";

  const primary = addresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId,
  );

  if (isVerified(primary)) return primary.emailAddress;

  const anyVerified = addresses.find(isVerified);

  return anyVerified ? anyVerified.emailAddress : null;
};

const getFullName = (clerkUser, email) => {
  const joined = [clerkUser.firstName, clerkUser.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    joined || clerkUser.fullName || clerkUser.username || email.split("@")[0]
  );
};

const safeRollback = async (client) => {
  if (!client) return;

  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback failed:", rollbackError.message);
  }
};

export const createCompany = async (req, res, next) => {
  let client;
  let transactionStarted = false;

  try {
    // 1. Validate input (never trust the frontend)
    const validation = createCompanySchema.safeParse(req.body ?? {});

    if (!validation.success) {
      const errors = {};

      for (const issue of validation.error.issues) {
        const field = issue.path[0];
        if (field && !errors[field]) errors[field] = issue.message;
      }

      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
        errors,
      });
    }

    const {
      legalCompanyName,
      tradeName,
      industry,
      country,
      state,
      website,
      legalContactName,
      legalContactEmail,
    } = validation.data;

    const clerkUserId = req.clerkUserId;

    // 2. Existing ContractAI user? Do not create another company.
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE clerk_user_id = $1 LIMIT 1",
      [clerkUserId],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: USER_EXISTS_MESSAGE,
      });
    }

    // 3. Fetch complete user data from Clerk (server-side)
    let clerkUser;

    try {
      clerkUser = await clerkClient.users.getUser(clerkUserId);
    } catch (clerkError) {
      console.error("Clerk user lookup failed:", clerkError.message);

      return res.status(502).json({
        success: false,
        message:
          "Unable to verify your account right now. Please try again in a moment.",
      });
    }

    const email = getVerifiedEmail(clerkUser)?.toLowerCase() || null;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "No verified email address found for your account",
      });
    }

    const fullName = getFullName(clerkUser, email);

    // 4. Transaction: company + first user (ADMIN)
    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const existingCompany = await client.query(
      "SELECT id FROM companies WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [legalCompanyName],
    );

    if (existingCompany.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: COMPANY_EXISTS_MESSAGE,
      });
    }

    const companyResult = await client.query(
      `
      INSERT INTO companies (
        name,
        trade_name,
        industry,
        country,
        state_province,
        website,
        legal_contact_name,
        legal_contact_email
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        name,
        trade_name,
        industry,
        country,
        state_province,
        website,
        legal_contact_name,
        legal_contact_email
      `,
      [
        legalCompanyName,
        tradeName,
        industry,
        country,
        state,
        website,
        legalContactName,
        legalContactEmail,
      ],
    );

    const company = companyResult.rows[0];

    // Role is always assigned by the backend; first user is ADMIN
    const userResult = await client.query(
      `
      INSERT INTO users (
        company_id,
        clerk_user_id,
        email,
        full_name,
        role,
        is_active
      )
      VALUES ($1, $2, $3, $4, 'ADMIN', true)
      RETURNING
        id,
        clerk_user_id,
        email,
        full_name,
        role,
        is_active
      `,
      [company.id, clerkUserId, email, fullName],
    );

    const user = userResult.rows[0];

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Company created successfully",
      user: {
        id: user.id,
        clerkUserId: user.clerk_user_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        company: {
          id: company.id,
          name: company.name,
          tradeName: company.trade_name,
          industry: company.industry,
          country: company.country,
          state: company.state_province,
          website: company.website,
          legalContactName: company.legal_contact_name,
          legalContactEmail: company.legal_contact_email,
        },
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await safeRollback(client);
    }

    // Unique violation (double submit / race condition)
    if (error.code === "23505") {
      const constraint = String(error.constraint || "").toLowerCase();

      if (constraint.includes("clerk") || constraint.includes("email")) {
        return res.status(409).json({
          success: false,
          message: USER_EXISTS_MESSAGE,
        });
      }

      return res.status(409).json({
        success: false,
        message: COMPANY_EXISTS_MESSAGE,
      });
    }

    return next(error);
  } finally {
    if (client) client.release();
  }
};