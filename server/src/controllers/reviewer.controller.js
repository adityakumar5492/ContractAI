import pool from "../config/db.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getReviewers = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at,

        COUNT(DISTINCT CASE
          WHEN c.status IN (
            'UPLOADED',
            'ANALYZING',
            'AI_ANALYZED',
            'UNDER_REVIEW'
          )
          THEN c.id
        END)::INTEGER AS assigned_contracts,

        COUNT(DISTINCT CASE
          WHEN r.status IN ('PENDING', 'IN_PROGRESS')
          THEN r.id
        END)::INTEGER AS pending_reviews,

        COUNT(DISTINCT CASE
          WHEN r.status = 'COMPLETED'
          THEN r.id
        END)::INTEGER AS completed_reviews

      FROM users u

      LEFT JOIN contracts c
        ON c.assigned_reviewer_id = u.id
        AND c.company_id = u.company_id

      LEFT JOIN reviews r
        ON r.reviewer_id = u.id
        AND r.contract_id = c.id

      WHERE u.company_id = $1
        AND u.role = 'REVIEWER'

      GROUP BY
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.created_at

      ORDER BY u.created_at DESC
      `,
      [req.companyId],
    );

    return res.status(200).json({
      success: true,
      reviewers: result.rows.map((reviewer) => ({
        id: reviewer.id,
        email: reviewer.email,
        fullName: reviewer.full_name,
        role: reviewer.role,
        isActive: reviewer.is_active,
        createdAt: reviewer.created_at,
        assignedContracts: reviewer.assigned_contracts,
        pendingReviews: reviewer.pending_reviews,
        completedReviews: reviewer.completed_reviews,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const createReviewer = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { clerkUserId, email, fullName } = req.body;

    if (!clerkUserId || typeof clerkUserId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Clerk user ID is required",
      });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedClerkUserId = clerkUserId.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName =
      typeof fullName === "string" ? fullName.trim() || null : null;

    await client.query("BEGIN");
    transactionStarted = true;

    const existingUser = await client.query(
      `
      SELECT
        id,
        company_id,
        email,
        full_name,
        role,
        is_active
      FROM users
      WHERE clerk_user_id = $1
      LIMIT 1
      `,
      [normalizedClerkUserId],
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      if (user.company_id !== req.companyId) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: "This user belongs to another company",
        });
      }

      if (user.role === "ADMIN") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: "An admin cannot be added as a reviewer",
        });
      }

      if (user.role === "REVIEWER") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: "User is already a reviewer",
        });
      }
    }

    const emailExists = await client.query(
      `
      SELECT id
      FROM users
      WHERE company_id = $1
        AND LOWER(email) = LOWER($2)
      LIMIT 1
      `,
      [req.companyId, normalizedEmail],
    );

    if (emailExists.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: "A user with this email already exists in your company",
      });
    }

    const result = await client.query(
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
      RETURNING
        id,
        clerk_user_id,
        email,
        full_name,
        role,
        is_active,
        created_at
      `,
      [
        req.companyId,
        normalizedClerkUserId,
        normalizedEmail,
        normalizedFullName,
      ],
    );

    const reviewer = result.rows[0];

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
        req.companyId,
        req.userId,
        "REVIEWER_CREATED",
        `Reviewer ${reviewer.email} was added`,
        JSON.stringify({
          reviewerId: reviewer.id,
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.full_name,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Reviewer created successfully",
      reviewer: {
        id: reviewer.id,
        clerkUserId: reviewer.clerk_user_id,
        email: reviewer.email,
        fullName: reviewer.full_name,
        role: reviewer.role,
        isActive: reviewer.is_active,
        createdAt: reviewer.created_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        next(rollbackError);
        return;
      }
    }

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A user with this Clerk account already exists",
      });
    }

    next(error);
  } finally {
    client.release();
  }
};

export const updateReviewer = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!UUID_PATTERN.test(id)) {
      return res.status(404).json({
        success: false,
        message: "Reviewer not found",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    const reviewerResult = await client.query(
      `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active
      FROM users
      WHERE id = $1
        AND company_id = $2
        AND role = 'REVIEWER'
      LIMIT 1
      `,
      [id, req.companyId],
    );

    if (reviewerResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Reviewer not found",
      });
    }

    const existingReviewer = reviewerResult.rows[0];

    if (existingReviewer.is_active === isActive) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(200).json({
        success: true,
        message: isActive
          ? "Reviewer is already active"
          : "Reviewer is already inactive",
        reviewer: {
          id: existingReviewer.id,
          email: existingReviewer.email,
          fullName: existingReviewer.full_name,
          role: existingReviewer.role,
          isActive: existingReviewer.is_active,
        },
      });
    }

    const result = await client.query(
      `
      UPDATE users
      SET
        is_active = $1,
        updated_at = NOW()
      WHERE id = $2
        AND company_id = $3
        AND role = 'REVIEWER'
      RETURNING
        id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
      `,
      [isActive, id, req.companyId],
    );

    const reviewer = result.rows[0];

    const action = isActive
      ? "REVIEWER_ACTIVATED"
      : "REVIEWER_DEACTIVATED";

    const description = isActive
      ? `Reviewer ${reviewer.email} was activated`
      : `Reviewer ${reviewer.email} was deactivated`;

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
        req.companyId,
        req.userId,
        action,
        description,
        JSON.stringify({
          reviewerId: reviewer.id,
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.full_name,
          isActive: reviewer.is_active,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: isActive
        ? "Reviewer activated successfully"
        : "Reviewer deactivated successfully",
      reviewer: {
        id: reviewer.id,
        email: reviewer.email,
        fullName: reviewer.full_name,
        role: reviewer.role,
        isActive: reviewer.is_active,
        createdAt: reviewer.created_at,
        updatedAt: reviewer.updated_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        next(rollbackError);
        return;
      }
    }

    next(error);
  } finally {
    client.release();
  }
};