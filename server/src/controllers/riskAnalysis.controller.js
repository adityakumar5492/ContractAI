import pool from "../config/db.js";
import aiRiskAnalysisService from "../services/aiRiskAnalysis.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RISK_CATEGORIES = new Set([
  "TERMINATION", "PAYMENT", "LIABILITY", "INDEMNIFICATION", "CONFIDENTIALITY",
  "INTELLECTUAL_PROPERTY", "DATA_PROTECTION", "WARRANTIES", "RENEWAL",
  "GOVERNING_LAW", "DISPUTE_RESOLUTION", "NON_COMPETE", "NON_SOLICITATION",
  "ASSIGNMENT", "COMPLIANCE", "FORCE_MAJEURE", "INSURANCE", "NOTICE", "OTHER",
]);
const RISK_SEVERITIES = new Set(["HIGH", "MEDIUM", "LOW"]);

const isValidFinding = (finding) =>
  finding && typeof finding === "object" && !Array.isArray(finding) &&
  RISK_CATEGORIES.has(finding.category) && RISK_SEVERITIES.has(finding.severity) &&
  typeof finding.title === "string" && finding.title.trim().length > 0 &&
  finding.title.trim().length <= 255 &&
  typeof finding.description === "string" && finding.description.trim().length > 0 &&
  typeof finding.evidence === "string" && finding.evidence.trim().length > 0 &&
  Array.isArray(finding.sourceChunks) && finding.sourceChunks.length > 0 &&
  finding.sourceChunks.every((chunk) => Number.isInteger(chunk) && chunk >= 0);

const findCompanyContractDocument = async (queryable, { contractId, companyId, userId, userRole, lock = false }) => {
  const reviewerFilter = userRole === "REVIEWER" ? "AND c.assigned_reviewer_id = $3" : "";
  const params = userRole === "REVIEWER"
    ? [contractId, companyId, userId]
    : [contractId, companyId];
  const lockClause = lock ? "FOR UPDATE OF c, d" : "";

  const result = await queryable.query(
    `
      SELECT c.id AS contract_id, c.company_id, c.contract_name,
             d.id AS document_id, r.id AS review_id
      FROM contracts c
      JOIN contract_documents d ON d.contract_id = c.id
      LEFT JOIN reviews r ON r.contract_id = c.id
      WHERE c.id = $1
        AND c.company_id = $2
        AND d.id = (
          SELECT cd.id
          FROM contract_documents cd
          WHERE cd.contract_id = c.id
          ORDER BY cd.created_at DESC
          LIMIT 1
        )
        ${reviewerFilter}
      ${lockClause}
      LIMIT 1
    `,
    params,
  );
  return result.rows[0] ?? null;
};

export const analyzeAndPersistContractRisks = async (req, res, next) => {
  const { id: contractId } = req.params;
  if (!UUID_PATTERN.test(contractId ?? "")) {
    return res.status(404).json({ success: false, message: "Contract not found" });
  }

  let ownership;
  try {
    ownership = await findCompanyContractDocument(pool, {
      contractId,
      companyId: req.companyId,
      userId: req.userId,
      userRole: req.userRole,
    });
  } catch (error) {
    return next(error);
  }

  if (!ownership) {
    return res.status(404).json({ success: false, message: "Contract or document not found" });
  }

  let analysis;
  try {
    analysis = await aiRiskAnalysisService.analyzeContractRisks(ownership.document_id);
  } catch {
    return res.status(503).json({
      success: false,
      message: "Risk analysis is temporarily unavailable. Please try again later.",
    });
  }

  if (!analysis || analysis.documentId !== ownership.document_id || !Array.isArray(analysis.findings) ||
      analysis.findings.length > 40 ||
      analysis.findings.some((finding) => !isValidFinding(finding))) {
    return res.status(502).json({
      success: false,
      message: "Risk analysis returned invalid findings. No findings were saved.",
    });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    // Re-check and lock the company-scoped contract/document after the external
    // AI call, preventing ownership or document changes from racing persistence.
    const current = await findCompanyContractDocument(client, {
      contractId,
      companyId: req.companyId,
      userId: req.userId,
      userRole: req.userRole,
      lock: true,
    });
    if (!current || current.document_id !== ownership.document_id) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Contract or document not found" });
    }

    const savedFindings = [];
    for (const finding of analysis.findings) {
      // The existing schema has no category column. Prefixing the reason keeps
      // the AI category alongside the existing descriptive text without
      // misusing the document section or recommendation fields.
      const reason = `[${finding.category}] ${finding.description.trim()}`;
      const insertResult = await client.query(
        `
          INSERT INTO risk_findings (
            contract_id, review_id, risk_level, title, reason, evidence, status
          )
          SELECT $1, $2, $3::risk_level, $4, $5, $6, 'PENDING'::finding_status
          WHERE NOT EXISTS (
            SELECT 1
            FROM risk_findings existing
            WHERE existing.contract_id = $1
              AND existing.risk_level = $3::risk_level
              AND existing.title = $4
              AND existing.reason = $5
              AND existing.evidence = $6
          )
          RETURNING id, contract_id, review_id, risk_level, title, reason,
                    evidence, status, created_at, updated_at
        `,
        [
          contractId,
          current.review_id,
          finding.severity,
          finding.title.trim(),
          reason,
          finding.evidence.trim(),
        ],
      );
      if (insertResult.rows[0]) savedFindings.push(insertResult.rows[0]);
    }

    await client.query(
      `
        INSERT INTO audit_logs (
          company_id, user_id, contract_id, action, description, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        req.companyId,
        req.userId,
        contractId,
        "CONTRACT_RISKS_ANALYZED",
        `Risk analysis findings were persisted for "${current.contract_name}"`,
        JSON.stringify({
          contractId,
          documentId: current.document_id,
          findingCount: analysis.findings.length,
          insertedCount: savedFindings.length,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(200).json({
      success: true,
      contractId,
      documentId: current.document_id,
      findingCount: analysis.findings.length,
      insertedCount: savedFindings.length,
      findings: analysis.findings,
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

export { isValidFinding };
