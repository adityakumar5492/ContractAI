import pool from "../config/db.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        email,
        full_name,
        role,
        is_active,
        created_at
      FROM users
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [id, req.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};