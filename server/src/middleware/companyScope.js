import pool from "../config/db.js";

export const companyScope = async (req, res, next) => {
  try {
    if (!req.clerkUserId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        company_id,
        role,
        is_active
      FROM users
      WHERE clerk_user_id = $1
      LIMIT 1
      `,
      [req.clerkUserId],
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        needsOnboarding: true,
        message: "Complete onboarding to access this resource",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your ContractAI account is inactive",
      });
    }

    req.dbUser = {
      id: user.id,
      companyId: user.company_id,
      role: user.role,
    };

    req.companyId = user.company_id;
    req.userId = user.id;
    req.userRole = user.role;

    next();
  } catch (error) {
    next(error);
  }
};