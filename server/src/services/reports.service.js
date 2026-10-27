import pool from "../config/db.js";

const toCount = (value) => Number(value ?? 0);

const contractScope = (userRole) =>
  userRole === "REVIEWER" ? "AND c.assigned_reviewer_id = $2" : "";

const mapCounts = (row, fields) =>
  Object.fromEntries(fields.map(([key, column]) => [key, toCount(row?.[column])]));

export const getReportsSummary = async ({ companyId, userId, userRole }) => {
  const scopeSql = contractScope(userRole);
  const scopeParams = userRole === "REVIEWER" ? [companyId, userId] : [companyId];

  const [contractsResult, findingsResult, reviewsResult, recentFindingsResult] =
    await Promise.all([
      pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total_contracts,
            COUNT(*) FILTER (WHERE c.status = 'UPLOADED')::INTEGER AS uploaded,
            COUNT(*) FILTER (WHERE c.status = 'ANALYZING')::INTEGER AS analyzing,
            COUNT(*) FILTER (WHERE c.status = 'AI_ANALYZED')::INTEGER AS ai_analyzed,
            COUNT(*) FILTER (WHERE c.status = 'UNDER_REVIEW')::INTEGER AS under_review,
            COUNT(*) FILTER (WHERE c.status = 'COMPLETED')::INTEGER AS completed,
            COUNT(*) FILTER (WHERE c.status = 'CHANGES_REQUESTED')::INTEGER AS changes_requested
          FROM contracts c
          WHERE c.company_id = $1
            ${scopeSql}
        `,
        scopeParams,
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total_findings,
            COUNT(*) FILTER (WHERE f.risk_level = 'HIGH')::INTEGER AS high_risk,
            COUNT(*) FILTER (WHERE f.risk_level = 'MEDIUM')::INTEGER AS medium_risk,
            COUNT(*) FILTER (WHERE f.risk_level = 'LOW')::INTEGER AS low_risk,
            COUNT(*) FILTER (WHERE f.status = 'PENDING')::INTEGER AS pending,
            COUNT(*) FILTER (WHERE f.status = 'ACCEPTED')::INTEGER AS accepted,
            COUNT(*) FILTER (WHERE f.status = 'DISMISSED')::INTEGER AS dismissed
          FROM risk_findings f
          JOIN contracts c ON c.id = f.contract_id
          WHERE c.company_id = $1
            ${scopeSql}
        `,
        scopeParams,
      ),
      pool.query(
        `
          SELECT
            COUNT(*)::INTEGER AS total_reviews,
            COUNT(*) FILTER (WHERE r.status = 'PENDING')::INTEGER AS pending,
            COUNT(*) FILTER (WHERE r.status = 'IN_PROGRESS')::INTEGER AS in_progress,
            COUNT(*) FILTER (WHERE r.status = 'COMPLETED')::INTEGER AS completed,
            COUNT(*) FILTER (WHERE r.status = 'CHANGES_REQUESTED')::INTEGER AS changes_requested
          FROM reviews r
          JOIN contracts c ON c.id = r.contract_id
          WHERE c.company_id = $1
            ${scopeSql}
        `,
        scopeParams,
      ),
      pool.query(
        `
          SELECT
            f.id,
            f.contract_id,
            c.contract_name,
            c.vendor_name,
            f.title,
            f.risk_level,
            f.status,
            f.created_at
          FROM risk_findings f
          JOIN contracts c ON c.id = f.contract_id
          WHERE c.company_id = $1
            ${scopeSql}
          ORDER BY f.created_at DESC, f.id DESC
          LIMIT 8
        `,
        scopeParams,
      ),
    ]);

  const contracts = contractsResult.rows[0] ?? {};
  const findings = findingsResult.rows[0] ?? {};
  const reviews = reviewsResult.rows[0] ?? {};

  return {
    summary: {
      totalContracts: toCount(contracts.total_contracts),
      totalFindings: toCount(findings.total_findings),
      highRiskFindings: toCount(findings.high_risk),
      mediumRiskFindings: toCount(findings.medium_risk),
      lowRiskFindings: toCount(findings.low_risk),
    },
    findings: mapCounts(findings, [
      ["pending", "pending"],
      ["accepted", "accepted"],
      ["dismissed", "dismissed"],
    ]),
    contracts: mapCounts(contracts, [
      ["uploaded", "uploaded"],
      ["analyzing", "analyzing"],
      ["aiAnalyzed", "ai_analyzed"],
      ["underReview", "under_review"],
      ["completed", "completed"],
      ["changesRequested", "changes_requested"],
    ]),
    reviews: mapCounts(reviews, [
      ["total", "total_reviews"],
      ["pending", "pending"],
      ["inProgress", "in_progress"],
      ["completed", "completed"],
      ["changesRequested", "changes_requested"],
    ]),
    recentFindings: recentFindingsResult.rows.map((finding) => ({
      id: finding.id,
      contractId: finding.contract_id,
      contractName: finding.contract_name,
      vendorName: finding.vendor_name,
      title: finding.title,
      riskLevel: finding.risk_level,
      status: finding.status,
      createdAt: finding.created_at,
    })),
  };
};

export default { getReportsSummary };
