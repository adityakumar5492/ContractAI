import pool from "../config/db.js";

export const getCurrentUser = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.clerk_user_id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        c.id AS company_id,
        c.name AS company_name
      FROM users u
      LEFT JOIN companies c
        ON c.id = u.company_id
      WHERE u.clerk_user_id = $1
      LIMIT 1
      `,
      [req.clerkUserId],
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        authenticated: true,
        needsOnboarding: true,
        user: null,
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your ContractAI account is inactive",
      });
    }

    return res.status(200).json({
      success: true,
      authenticated: true,
      needsOnboarding: false,
      user: {
        id: user.id,
        clerkUserId: user.clerk_user_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        company: {
          id: user.company_id,
          name: user.company_name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};