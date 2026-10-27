import { z } from "zod";

import pool from "../config/db.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateReviewSchema = z
  .object({
    status: z.enum(["IN_PROGRESS", "COMPLETED", "CHANGES_REQUESTED"]),
    finalNotes: z.string().max(10000).optional(),
  })
  .strict();

const allowedTransitions = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["IN_PROGRESS"],
  COMPLETED: [],
};

const contractStatusForReview = {
  IN_PROGRESS: "UNDER_REVIEW",
  COMPLETED: "COMPLETED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
};

const findContractReview = async ({ contractId, companyId, userId, userRole }) => {
  const reviewerFilter = userRole === "REVIEWER" ? "AND c.assigned_reviewer_id = $3" : "";
  const params = userRole === "REVIEWER"
    ? [contractId, companyId, userId]
    : [contractId, companyId];

  const result = await pool.query(
    `
      SELECT
        c.id AS contract_id,
        c.contract_name,
        c.risk_score,
        c.risk_level,
        c.assigned_reviewer_id,
        reviewer.full_name AS reviewer_name,
        reviewer.email AS reviewer_email,
        r.id AS review_id,
        r.status AS review_status,
        r.final_notes,
        r.completed_at,
        r.updated_at AS review_updated_at
      FROM contracts c
      LEFT JOIN users reviewer
        ON reviewer.id = c.assigned_reviewer_id
       AND reviewer.company_id = c.company_id
      LEFT JOIN reviews r
        ON r.contract_id = c.id
       AND r.reviewer_id = c.assigned_reviewer_id
      WHERE c.id = $1
        AND c.company_id = $2
        ${reviewerFilter}
      LIMIT 1
    `,
    params,
  );
  return result.rows[0] ?? null;
};

const buildRiskSummary = (contract, findings = []) => {
  const counts = {
    totalFindings: findings.length,
    high: 0,
    medium: 0,
    low: 0,
    pending: 0,
    accepted: 0,
    dismissed: 0,
  };
  for (const finding of findings) {
    if (finding.risk_level === "HIGH") counts.high += 1;
    if (finding.risk_level === "MEDIUM") counts.medium += 1;
    if (finding.risk_level === "LOW") counts.low += 1;
    if (finding.status === "PENDING") counts.pending += 1;
    if (finding.status === "ACCEPTED") counts.accepted += 1;
    if (finding.status === "DISMISSED") counts.dismissed += 1;
  }

  const storedScore = Number(contract.risk_score);
  const riskScore = contract.risk_score !== null && contract.risk_score !== undefined &&
    Number.isInteger(storedScore) && storedScore >= 0 && storedScore <= 100
    ? storedScore
    : null;
  const riskLevel = ["HIGH", "MEDIUM", "LOW"].includes(contract.risk_level)
    ? contract.risk_level
    : null;

  return { riskScore, riskLevel, ...counts };
};

export const getContractReview = async (req, res, next) => {
  const { id: contractId } = req.params;
  if (!UUID_PATTERN.test(contractId ?? "")) {
    return res.status(404).json({ success: false, message: "Contract not found" });
  }

  try {
    const contractReview = await findContractReview({
      contractId,
      companyId: req.companyId,
      userId: req.userId,
      userRole: req.userRole,
    });
    if (!contractReview) {
      return res.status(404).json({ success: false, message: "Contract not found" });
    }

    const [findingsResult, commentsResult] = await Promise.all([
      pool.query(
        `
          SELECT id, contract_id, review_id, risk_level, title, reason, evidence,
                 recommendation, page_number, section, status, created_at, updated_at
          FROM risk_findings
          WHERE contract_id = $1
          ORDER BY created_at ASC, id ASC
        `,
        [contractId],
      ),
      pool.query(
        `
          SELECT rc.id, rc.finding_id, rc.reviewer_id, u.full_name AS reviewer_name,
                 rc.comment, rc.created_at
          FROM review_comments rc
          JOIN risk_findings f ON f.id = rc.finding_id
          JOIN contracts c ON c.id = f.contract_id
          LEFT JOIN users u ON u.id = rc.reviewer_id AND u.company_id = c.company_id
          WHERE c.id = $1 AND c.company_id = $2
          ORDER BY rc.created_at ASC, rc.id ASC
        `,
        [contractId, req.companyId],
      ),
    ]);

    const commentsByFinding = new Map();
    for (const row of commentsResult.rows) {
      const comments = commentsByFinding.get(row.finding_id) || [];
      comments.push({
        id: row.id,
        reviewerId: row.reviewer_id,
        reviewerName: row.reviewer_name,
        comment: row.comment,
        createdAt: row.created_at,
      });
      commentsByFinding.set(row.finding_id, comments);
    }
    const riskSummary = buildRiskSummary(contractReview, findingsResult.rows);

    const review = contractReview.review_id
      ? {
          id: contractReview.review_id,
          contractId: contractReview.contract_id,
          status: contractReview.review_status,
          finalNotes: contractReview.final_notes,
          completedAt: contractReview.completed_at,
          updatedAt: contractReview.review_updated_at,
          reviewer: contractReview.assigned_reviewer_id
            ? {
                id: contractReview.assigned_reviewer_id,
                fullName: contractReview.reviewer_name,
                email: contractReview.reviewer_email,
              }
            : null,
        }
      : null;

    return res.status(200).json({
      success: true,
      review,
      riskSummary,
      findings: findingsResult.rows.map((finding) => ({
        id: finding.id,
        contractId: finding.contract_id,
        reviewId: finding.review_id,
        riskLevel: finding.risk_level,
        title: finding.title,
        reason: finding.reason,
        evidence: finding.evidence,
        recommendation: finding.recommendation,
        pageNumber: finding.page_number,
        section: finding.section,
        status: finding.status,
        createdAt: finding.created_at,
        updatedAt: finding.updated_at,
        comments: commentsByFinding.get(finding.id) || [],
      })),
    });
  } catch (error) {
    return next(error);
  }
};

const lockAssignedFinding = async (client, { contractId, findingId, companyId, userId }) => {
  const result = await client.query(
    `
      SELECT f.id, f.contract_id, f.status AS finding_status, f.title,
             c.contract_name, r.id AS review_id, r.status AS review_status
      FROM risk_findings f
      JOIN contracts c ON c.id = f.contract_id
      JOIN reviews r ON r.contract_id = c.id AND r.reviewer_id = c.assigned_reviewer_id
      WHERE f.id = $1
        AND c.id = $2
        AND c.company_id = $3
        AND c.assigned_reviewer_id = $4
        AND r.reviewer_id = $4
      FOR UPDATE OF f, r
    `,
    [findingId, contractId, companyId, userId],
  );
  return result.rows[0] ?? null;
};

export const updateFindingStatus = async (req, res, next) => {
  const { id: contractId, findingId } = req.params;
  if (!UUID_PATTERN.test(contractId ?? "") || !UUID_PATTERN.test(findingId ?? "")) {
    return res.status(404).json({ success: false, message: "Finding not found" });
  }
  const validation = z.object({ status: z.enum(["ACCEPTED", "DISMISSED"]) }).strict().safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ success: false, message: "Invalid finding status" });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const finding = await lockAssignedFinding(client, {
      contractId, findingId, companyId: req.companyId, userId: req.userId,
    });
    if (!finding) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Finding not found" });
    }
    if (finding.review_status !== "IN_PROGRESS") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Findings can only be updated during an in-progress review" });
    }
    if (finding.finding_status !== "PENDING") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Only pending findings can be updated" });
    }

    const { status } = validation.data;
    const updated = await client.query(
      `UPDATE risk_findings SET status = $1::finding_status, updated_at = NOW()
       WHERE id = $2 RETURNING id, status, updated_at`,
      [status, findingId],
    );
    const action = status === "ACCEPTED" ? "FINDING_ACCEPTED" : "FINDING_DISMISSED";
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, contract_id, action, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.companyId, req.userId, contractId, action,
        `Finding "${finding.title}" was ${status.toLowerCase()}`,
        JSON.stringify({ findingId, reviewId: finding.review_id, status }),
      ],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(200).json({
      success: true,
      finding: { id: updated.rows[0].id, status: updated.rows[0].status, updatedAt: updated.rows[0].updated_at },
    });
  } catch (error) {
    if (transactionStarted) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { return next(rollbackError); }
    }
    return next(error);
  } finally {
    client?.release();
  }
};

export const addFindingComment = async (req, res, next) => {
  const { id: contractId, findingId } = req.params;
  if (!UUID_PATTERN.test(contractId ?? "") || !UUID_PATTERN.test(findingId ?? "")) {
    return res.status(404).json({ success: false, message: "Finding not found" });
  }
  const validation = z.object({ comment: z.string().trim().min(1).max(5000) }).strict().safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ success: false, message: "Comment must contain 1 to 5000 characters" });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const finding = await lockAssignedFinding(client, {
      contractId, findingId, companyId: req.companyId, userId: req.userId,
    });
    if (!finding) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Finding not found" });
    }
    if (finding.review_status !== "IN_PROGRESS") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Comments can only be added during an in-progress review" });
    }

    const commentText = validation.data.comment;
    const inserted = await client.query(
      `INSERT INTO review_comments (finding_id, reviewer_id, comment)
       VALUES ($1, $2, $3)
       RETURNING id, finding_id, reviewer_id, comment, created_at`,
      [findingId, req.userId, commentText],
    );
    const comment = inserted.rows[0];
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, contract_id, action, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.companyId, req.userId, contractId, "REVIEW_COMMENT_ADDED",
        `A reviewer comment was added to finding "${finding.title}"`,
        JSON.stringify({ findingId, reviewId: finding.review_id, commentId: comment.id }),
      ],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        findingId: comment.finding_id,
        reviewerId: comment.reviewer_id,
        comment: comment.comment,
        createdAt: comment.created_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { return next(rollbackError); }
    }
    return next(error);
  } finally {
    client?.release();
  }
};

export const updateReview = async (req, res, next) => {
  const { id } = req.params;

  if (!UUID_PATTERN.test(id)) {
    return res.status(404).json({
      success: false,
      message: "Review not found",
    });
  }

  const validation = updateReviewSchema.safeParse(req.body ?? {});

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid review update",
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const { status: nextStatus, finalNotes } = validation.data;
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const reviewResult = await client.query(
      `
        SELECT
          r.id,
          r.contract_id,
          r.reviewer_id,
          r.status,
          r.final_notes,
          c.company_id,
          c.assigned_reviewer_id,
          c.contract_name
        FROM reviews r
        JOIN contracts c
          ON c.id = r.contract_id
        WHERE r.id = $1
          AND c.company_id = $2
        FOR UPDATE OF r, c
      `,
      [id, req.companyId],
    );

    if (reviewResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const review = reviewResult.rows[0];

    if (
      review.reviewer_id !== req.userId ||
      review.assigned_reviewer_id !== req.userId
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (!allowedTransitions[review.status]?.includes(nextStatus)) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        success: false,
        message: `Cannot change a review from ${review.status} to ${nextStatus}`,
      });
    }

    const reviewUpdateResult = await client.query(
      `
        UPDATE reviews
        SET
          status = $1::review_status,
          final_notes = CASE
            WHEN $2::boolean THEN $3
            ELSE final_notes
          END,
          completed_at = CASE
            WHEN $1 = 'COMPLETED' THEN NOW()
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE id = $4
        RETURNING
          id,
          contract_id,
          reviewer_id,
          status,
          final_notes,
          completed_at,
          updated_at
      `,
      [nextStatus, finalNotes !== undefined, finalNotes ?? null, id],
    );

    const updatedReview = reviewUpdateResult.rows[0];
    const contractStatus = contractStatusForReview[nextStatus];

    await client.query(
      `
        UPDATE contracts
        SET status = $1::contract_status,
            updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
      `,
      [contractStatus, review.contract_id, req.companyId],
    );

    const action =
      review.status === "IN_PROGRESS" && nextStatus === "IN_PROGRESS"
        ? "REVIEW_NOTES_UPDATED"
        : nextStatus === "IN_PROGRESS"
          ? "REVIEW_STARTED"
          : nextStatus === "COMPLETED"
            ? "REVIEW_COMPLETED"
            : "REVIEW_CHANGES_REQUESTED";

    const description =
      action === "REVIEW_NOTES_UPDATED"
        ? `Review notes were updated for "${review.contract_name}"`
        : `Review for "${review.contract_name}" changed to ${nextStatus}`;

    await client.query(
      `
        INSERT INTO audit_logs (
          company_id,
          user_id,
          contract_id,
          action,
          description,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        req.companyId,
        req.userId,
        review.contract_id,
        action,
        description,
        JSON.stringify({
          reviewId: updatedReview.id,
          status: updatedReview.status,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      review: {
        id: updatedReview.id,
        contractId: updatedReview.contract_id,
        reviewerId: updatedReview.reviewer_id,
        status: updatedReview.status,
        finalNotes: updatedReview.final_notes,
        completedAt: updatedReview.completed_at,
        updatedAt: updatedReview.updated_at,
      },
      contractStatus,
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

export { buildRiskSummary };
