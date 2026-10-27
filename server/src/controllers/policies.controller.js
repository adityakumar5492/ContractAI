import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import pool from "../config/db.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const getPolicyDirectory = () => path.join(process.cwd(), "uploads", "policies");
const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveStoredPolicyFile = (fileKey) => {
  const prefix = "uploads/policies/";
  if (typeof fileKey !== "string" || !fileKey.startsWith(prefix)) return null;
  const storedName = fileKey.slice(prefix.length);
  if (!storedName || path.basename(storedName) !== storedName) return null;
  const directory = path.resolve(getPolicyDirectory());
  const target = path.resolve(directory, storedName);
  return path.dirname(target) === directory ? target : null;
};

const mapPolicy = (policy) => ({
  id: policy.id,
  title: policy.title,
  description: policy.description,
  fileName: policy.file_name,
  isActive: policy.is_active,
  status: policy.is_active ? "ACTIVE" : "INACTIVE",
  chunkCount: Number(policy.chunk_count || 0),
  createdAt: policy.created_at,
  updatedAt: policy.updated_at,
});

export const getPolicies = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT
          p.id,
          p.title,
          p.description,
          p.file_name,
          p.is_active,
          p.created_at,
          p.updated_at,
          COUNT(pc.id)::INTEGER AS chunk_count
        FROM policies p
        LEFT JOIN policy_chunks pc ON pc.policy_id = p.id
        WHERE p.company_id = $1
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.created_at DESC
      `,
      [req.companyId],
    );

    return res.status(200).json({
      success: true,
      policies: result.rows.map(mapPolicy),
    });
  } catch (error) {
    next(error);
  }
};

export const getPolicyById = async (req, res, next) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id ?? "")) {
    return res.status(404).json({ success: false, message: "Policy not found" });
  }

  try {
    const result = await pool.query(
      `
        SELECT p.id, p.title, p.description, p.file_name, p.is_active,
               p.created_at, p.updated_at, COUNT(pc.id)::INTEGER AS chunk_count
        FROM policies p
        LEFT JOIN policy_chunks pc ON pc.policy_id = p.id
        WHERE p.id = $1 AND p.company_id = $2
        GROUP BY p.id
      `,
      [id, req.companyId],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Policy not found" });
    }
    return res.status(200).json({ success: true, policy: mapPolicy(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
};

export const updatePolicyStatus = async (req, res, next) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id ?? "")) {
    return res.status(404).json({ success: false, message: "Policy not found" });
  }
  const validation = z.object({ isActive: z.boolean() }).strict().safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ success: false, message: "isActive must be a boolean" });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const updated = await client.query(
      `UPDATE policies
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING id, title, description, file_name, is_active, created_at, updated_at`,
      [validation.data.isActive, id, req.companyId],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Policy not found" });
    }
    const policy = updated.rows[0];
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, action, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.companyId,
        req.userId,
        policy.is_active ? "POLICY_ACTIVATED" : "POLICY_DEACTIVATED",
        `Policy "${policy.title}" was ${policy.is_active ? "activated" : "deactivated"}`,
        JSON.stringify({ policyId: policy.id, isActive: policy.is_active }),
      ],
    );
    await client.query("COMMIT");
    transactionStarted = false;
    return res.status(200).json({
      success: true,
      message: `Policy ${policy.is_active ? "activated" : "deactivated"} successfully.`,
      policy: mapPolicy({ ...policy, chunk_count: 0 }),
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

export const deletePolicy = async (req, res, next) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id ?? "")) {
    return res.status(404).json({ success: false, message: "Policy not found" });
  }

  let client;
  let transactionStarted = false;
  let filePath = null;
  let fileIsShared = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const selected = await client.query(
      `SELECT id, title, file_key FROM policies
       WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [id, req.companyId],
    );
    const policy = selected.rows[0];
    if (!policy) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Policy not found" });
    }

    filePath = resolveStoredPolicyFile(policy.file_key);
    if (filePath) {
      const shared = await client.query(
        "SELECT 1 FROM policies WHERE file_key = $1 AND id <> $2 LIMIT 1",
        [policy.file_key, id],
      );
      fileIsShared = shared.rows.length > 0;
    }

    // policy_chunks has ON DELETE CASCADE, so dependent chunks are removed by PostgreSQL.
    await client.query("DELETE FROM policies WHERE id = $1 AND company_id = $2", [id, req.companyId]);
    await client.query(
      `INSERT INTO audit_logs (company_id, user_id, action, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.companyId,
        req.userId,
        "POLICY_DELETED",
        `Policy "${policy.title}" was deleted`,
        JSON.stringify({ policyId: policy.id, title: policy.title }),
      ],
    );
    await client.query("COMMIT");
    transactionStarted = false;

    let fileCleanupPending = false;
    if (filePath && !fileIsShared) {
      try {
        const directory = await fs.realpath(getPolicyDirectory());
        const entry = await fs.lstat(filePath);
        if (entry.isSymbolicLink()) {
          fileCleanupPending = true;
        } else {
          const actualFilePath = await fs.realpath(filePath);
          if (path.dirname(actualFilePath) !== directory) {
            fileCleanupPending = true;
          } else {
            await fs.unlink(filePath);
          }
        }
      } catch (fileError) {
        if (fileError.code !== "ENOENT") fileCleanupPending = true;
      }
    }

    if (fileCleanupPending) console.error("Policy file cleanup failed after record deletion.");
    return res.status(200).json({
      success: true,
      message: "Policy deleted successfully.",
      ...(fileCleanupPending ? { fileCleanupPending: true } : {}),
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

export const uploadPolicy = async (req, res, next) => {
  let storedFilePath = null;
  let client = null;

  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";

    if (!title || title.length > 255) {
      return res.status(400).json({ success: false, message: "Policy name is required and must be 255 characters or less." });
    }
    if (description.length > 5000) {
      return res.status(400).json({ success: false, message: "Description cannot exceed 5000 characters." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Policy PDF is required." });
    }
    if (req.file.mimetype !== "application/pdf" || req.file.buffer.subarray(0, 5).toString() !== "%PDF-") {
      return res.status(400).json({ success: false, message: "A valid PDF policy document is required." });
    }
    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, message: "PDF file cannot exceed 10 MB." });
    }
    if (!req.file.originalname || req.file.originalname.length > 255) {
      return res.status(400).json({ success: false, message: "File name must be 255 characters or less." });
    }

    const directory = getPolicyDirectory();
    await fs.mkdir(directory, { recursive: true });
    const storedName = `${randomUUID()}-${safeFileName(req.file.originalname)}`;
    storedFilePath = path.join(directory, storedName);
    await fs.writeFile(storedFilePath, req.file.buffer, { flag: "wx" });

    client = await pool.connect();
    await client.query("BEGIN");
    const fileKey = `uploads/policies/${storedName}`;
    const insertResult = await client.query(
      `
        INSERT INTO policies (
          company_id,
          created_by,
          title,
          description,
          file_name,
          file_key
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, description, file_name, is_active, created_at, updated_at
      `,
      [req.companyId, req.userId, title, description || null, req.file.originalname, fileKey],
    );
    const policy = insertResult.rows[0];

    await client.query(
      `
        INSERT INTO audit_logs (company_id, user_id, action, description, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        req.companyId,
        req.userId,
        "POLICY_UPLOADED",
        `Policy "${policy.title}" was uploaded`,
        JSON.stringify({ policyId: policy.id, title: policy.title, fileName: policy.file_name }),
      ],
    );
    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: "Policy uploaded successfully.",
      policy: mapPolicy({ ...policy, chunk_count: 0 }),
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Policy upload rollback failed:", rollbackError);
      }
    }
    if (storedFilePath) {
      try {
        await fs.unlink(storedFilePath);
      } catch (fileError) {
        console.error("Policy file cleanup failed:", fileError);
      }
    }
    return next(error);
  } finally {
    client?.release();
  }
};
