import { z } from "zod";
import pool from "../config/db.js";

const optionalString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z.string().trim().optional(),
);

const companyUpdateSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  tradeName: optionalString,
  industry: z.string().trim().min(1, "Industry is required"),
  country: z.string().trim().min(1, "Country is required"),
  state: optionalString,
  website: z.string().trim().url("Please provide a valid website URL"),
  legalContactName: optionalString,
  legalContactEmail: z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return undefined;
      }

      if (typeof value === "string" && value.trim() === "") {
        return undefined;
      }

      return value;
    },
    z
      .string()
      .trim()
      .email("Please provide a valid email address")
      .optional(),
  ),
});

export const getCompany = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        trade_name,
        industry,
        country,
        state_province,
        website,
        legal_contact_name,
        legal_contact_email,
        created_at
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [req.companyId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const company = result.rows[0];

    return res.status(200).json({
      success: true,
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
        createdAt: company.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const validation = companyUpdateSchema.safeParse(req.body);

    if (!validation.success) {
      client.release();

      return res.status(400).json({
        success: false,
        message: "Invalid company information",
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      name,
      tradeName,
      industry,
      country,
      state,
      website,
      legalContactName,
      legalContactEmail,
    } = validation.data;

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `
      UPDATE companies
      SET
        name = $1,
        trade_name = $2,
        industry = $3,
        country = $4,
        state_province = $5,
        website = $6,
        legal_contact_name = $7,
        legal_contact_email = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING
        id,
        name,
        trade_name,
        industry,
        country,
        state_province,
        website,
        legal_contact_name,
        legal_contact_email,
        created_at,
        updated_at
      `,
      [
        name,
        tradeName || null,
        industry,
        country,
        state || null,
        website,
        legalContactName || null,
        legalContactEmail || null,
        req.companyId,
      ],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    const company = result.rows[0];

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
        "COMPANY_UPDATED",
        "Company information was updated",
        JSON.stringify({
          companyId: company.id,
          companyName: company.name,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      success: true,
      message: "Company updated successfully",
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
        createdAt: company.created_at,
        updatedAt: company.updated_at,
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