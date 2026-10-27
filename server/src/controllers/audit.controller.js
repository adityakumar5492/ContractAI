import pool from "../config/db.js";

export const getAuditLogs = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT
        a.id,
        a.action,
        a.description,
        a.metadata,
        a.contract_id,
        a.created_at,

        u.id AS user_id,
        u.full_name AS user_full_name,
        u.email AS user_email,

        c.contract_name,
        c.vendor_name

      FROM audit_logs a

      LEFT JOIN users u
        ON u.id = a.user_id
        AND u.company_id = a.company_id

      LEFT JOIN contracts c
        ON c.id = a.contract_id
        AND c.company_id = a.company_id

      WHERE a.company_id = $1

      ORDER BY a.created_at DESC

      LIMIT 50
      `,
      [req.companyId],
    );

    return res.status(200).json({
      success: true,
      auditLogs: result.rows.map((log) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        metadata: log.metadata,
        contractId: log.contract_id,
        createdAt: log.created_at,
        user: log.user_id
          ? {
              id: log.user_id,
              fullName: log.user_full_name,
              email: log.user_email,
            }
          : null,
        contract: log.contract_id
          ? {
              id: log.contract_id,
              contractName: log.contract_name,
              vendorName: log.vendor_name,
            }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};