import pool from "../config/db.js";

export const getDashboardSummary = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const [
      metricsResult,
      recentContractsResult,
      reviewerActivityResult,
      recentActivityResult,
    ] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::INTEGER AS total_contracts,

          COUNT(*) FILTER (
            WHERE status IN ('UPLOADED', 'ANALYZING', 'AI_ANALYZED')
          )::INTEGER AS pending_reviews,

          COUNT(*) FILTER (
            WHERE status = 'COMPLETED'
          )::INTEGER AS completed_reviews,

          COUNT(*) FILTER (
            WHERE risk_level = 'HIGH'
          )::INTEGER AS high_risk_contracts,

          COUNT(*) FILTER (
            WHERE status = 'UNDER_REVIEW'
          )::INTEGER AS contracts_under_review,

          COUNT(*) FILTER (
            WHERE status = 'CHANGES_REQUESTED'
          )::INTEGER AS contracts_needing_changes

        FROM contracts
        WHERE company_id = $1
        `,
        [companyId],
      ),

      pool.query(
        `
        SELECT
          id,
          contract_name,
          vendor_name,
          status,
          risk_score,
          risk_level,
          assigned_reviewer_id,
          created_at,
          updated_at
        FROM contracts
        WHERE company_id = $1
        ORDER BY created_at DESC
        LIMIT 5
        `,
        [companyId],
      ),

      pool.query(
        `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.is_active,

          COUNT(DISTINCT c.id)::INTEGER AS assigned_contracts,

          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status IN ('PENDING', 'IN_PROGRESS')
          )::INTEGER AS pending_reviews,

          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'COMPLETED'
          )::INTEGER AS completed_reviews

        FROM users u

        LEFT JOIN contracts c
          ON c.assigned_reviewer_id = u.id
          AND c.company_id = $1

        LEFT JOIN reviews r
          ON r.reviewer_id = u.id
          AND r.contract_id = c.id

        WHERE u.company_id = $1
          AND u.role = 'REVIEWER'

        GROUP BY
          u.id,
          u.full_name,
          u.email,
          u.is_active

        ORDER BY
          pending_reviews DESC,
          assigned_contracts DESC,
          u.full_name ASC

        LIMIT 10
        `,
        [companyId],
      ),

      pool.query(
        `
        SELECT
          a.id,
          a.action,
          a.description,
          a.metadata,
          a.contract_id,
          a.created_at,

          u.full_name AS user_full_name,
          u.email AS user_email

        FROM audit_logs a

        LEFT JOIN users u
          ON u.id = a.user_id
          AND u.company_id = $1

        WHERE a.company_id = $1

        ORDER BY a.created_at DESC

        LIMIT 10
        `,
        [companyId],
      ),
    ]);

    const metrics = metricsResult.rows[0];

    const recentContracts = recentContractsResult.rows.map((contract) => ({
      id: contract.id,
      contractName: contract.contract_name,
      vendorName: contract.vendor_name,
      status: contract.status,
      riskScore: contract.risk_score,
      riskLevel: contract.risk_level,
      assignedReviewerId: contract.assigned_reviewer_id,
      createdAt: contract.created_at,
      updatedAt: contract.updated_at,
    }));

    const reviewerActivity = reviewerActivityResult.rows.map((reviewer) => ({
      id: reviewer.id,
      fullName: reviewer.full_name,
      email: reviewer.email,
      isActive: reviewer.is_active,
      assignedContracts: reviewer.assigned_contracts,
      pendingReviews: reviewer.pending_reviews,
      completedReviews: reviewer.completed_reviews,
    }));

    const recentActivity = recentActivityResult.rows.map((activity) => ({
      id: activity.id,
      action: activity.action,
      description: activity.description,
      metadata: activity.metadata,
      contractId: activity.contract_id,
      createdAt: activity.created_at,
      user: activity.user_full_name
        ? {
            fullName: activity.user_full_name,
            email: activity.user_email,
          }
        : null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        metrics: {
          totalContracts: metrics.total_contracts,
          pendingReviews: metrics.pending_reviews,
          completedReviews: metrics.completed_reviews,
          highRiskContracts: metrics.high_risk_contracts,
          contractsUnderReview: metrics.contracts_under_review,
          contractsNeedingChanges: metrics.contracts_needing_changes,
        },
        recentContracts,
        reviewerActivity,
        recentActivity,
      },
    });
  } catch (error) {
    next(error);
  }
};