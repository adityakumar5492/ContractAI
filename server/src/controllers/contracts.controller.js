import path from "path";
import { randomUUID } from "crypto";

import pool from "../config/db.js";
import aiIngestionService from "../services/aiIngestion.service.js";
import supabase from "../config/supabase.js";
import { deletePdf, uploadPdf } from "../services/storage.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const getSafeFileName = (fileName) => {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
};

export const getContracts = async (req, res, next) => {
  try {
    const params = [req.companyId];
    let reviewerFilter = "";

    if (req.userRole !== "ADMIN") {
      params.push(req.userId);
      reviewerFilter = `
        AND c.assigned_reviewer_id = $2
      `;
    }

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.contract_name,
          c.vendor_name,
          c.description,
          c.status,
          c.risk_score,
          c.risk_level,
          c.uploaded_by,
          c.assigned_reviewer_id,
          c.created_at,
          c.updated_at,

          reviewer.id AS reviewer_id,
          reviewer.full_name AS reviewer_full_name,
          reviewer.email AS reviewer_email,

          review.status AS review_status,

          uploader.id AS uploader_id,
          uploader.full_name AS uploader_full_name,
          uploader.email AS uploader_email

        FROM contracts c

        LEFT JOIN users reviewer
          ON reviewer.id = c.assigned_reviewer_id
         AND reviewer.company_id = c.company_id

        LEFT JOIN users uploader
          ON uploader.id = c.uploaded_by
         AND uploader.company_id = c.company_id

        LEFT JOIN reviews review
          ON review.contract_id = c.id
         AND review.reviewer_id = c.assigned_reviewer_id

        WHERE c.company_id = $1
        ${reviewerFilter}

        ORDER BY c.updated_at DESC
      `,
      params,
    );

    const contracts = result.rows.map((contract) => ({
      id: contract.id,
      contractName: contract.contract_name,
      vendorName: contract.vendor_name,
      description: contract.description,
      status: contract.status,
      riskScore: contract.risk_score,
      riskLevel: contract.risk_level,
      uploadedBy: contract.uploaded_by,
      assignedReviewerId: contract.assigned_reviewer_id,
      reviewStatus: contract.review_status,

      reviewer: contract.reviewer_id
        ? {
            id: contract.reviewer_id,
            fullName: contract.reviewer_full_name,
            email: contract.reviewer_email,
          }
        : null,

      uploader: contract.uploader_id
        ? {
            id: contract.uploader_id,
            fullName: contract.uploader_full_name,
            email: contract.uploader_email,
          }
        : null,

      createdAt: contract.created_at,
      updatedAt: contract.updated_at,
    }));

    return res.status(200).json({
      success: true,
      contracts,
    });
  } catch (error) {
    next(error);
  }
};

export const getContractById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    const params = [id, req.companyId];
    let reviewerFilter = "";

    if (req.userRole !== "ADMIN") {
      params.push(req.userId);
      reviewerFilter = "AND c.assigned_reviewer_id = $3";
    }

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.contract_name,
          c.vendor_name,
          c.description,
          c.status,
          c.risk_score,
          c.risk_level,
          c.uploaded_by,
          c.assigned_reviewer_id,
          c.created_at,
          c.updated_at,

          reviewer.id AS reviewer_id,
          reviewer.full_name AS reviewer_full_name,
          reviewer.email AS reviewer_email,

          uploader.id AS uploader_id,
          uploader.full_name AS uploader_full_name,
          uploader.email AS uploader_email,

          review.id AS review_id,
          review.status AS review_status,
          review.final_notes AS review_final_notes,
          review.reviewer_id AS review_reviewer_id,
          review.completed_at AS review_completed_at,
          review.updated_at AS review_updated_at,

          document.id AS document_id,
          document.file_name AS document_file_name,
          document.file_size AS document_file_size,
          document.mime_type AS document_mime_type,
          document.page_count AS document_page_count,
          document.created_at AS document_created_at

        FROM contracts c

        LEFT JOIN users reviewer
          ON reviewer.id = c.assigned_reviewer_id
         AND reviewer.company_id = c.company_id

        LEFT JOIN users uploader
          ON uploader.id = c.uploaded_by
         AND uploader.company_id = c.company_id

        LEFT JOIN reviews review
          ON review.contract_id = c.id
          AND review.reviewer_id = c.assigned_reviewer_id

        LEFT JOIN LATERAL (
          SELECT
            cd.id,
            cd.file_name,
            cd.file_size,
            cd.mime_type,
            cd.page_count,
            cd.created_at
          FROM contract_documents cd
          WHERE cd.contract_id = c.id
          ORDER BY cd.created_at DESC
          LIMIT 1
        ) document ON true

        WHERE c.id = $1
          AND c.company_id = $2
          ${reviewerFilter}

        LIMIT 1
      `,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    const contract = result.rows[0];

    return res.status(200).json({
      success: true,
      contract: {
        id: contract.id,
        contractName: contract.contract_name,
        vendorName: contract.vendor_name,
        description: contract.description,
        status: contract.status,
        riskScore: contract.risk_score,
        riskLevel: contract.risk_level,
        uploadedBy: contract.uploaded_by,
        assignedReviewerId: contract.assigned_reviewer_id,

        reviewer: contract.reviewer_id
          ? {
              id: contract.reviewer_id,
              fullName: contract.reviewer_full_name,
              email: contract.reviewer_email,
            }
          : null,

        uploader: contract.uploader_id
          ? {
              id: contract.uploader_id,
              fullName: contract.uploader_full_name,
              email: contract.uploader_email,
            }
          : null,

        review: contract.review_id
          ? {
              id: contract.review_id,
              status: contract.review_status,
              finalNotes: contract.review_final_notes,
              reviewerId: contract.review_reviewer_id,
              completedAt: contract.review_completed_at,
              updatedAt: contract.review_updated_at,
            }
          : null,

        document: contract.document_id
          ? {
              id: contract.document_id,
              fileName: contract.document_file_name,
              fileSize: contract.document_file_size,
              mimeType: contract.document_mime_type,
              pageCount: contract.document_page_count,
              createdAt: contract.document_created_at,
            }
          : null,

        createdAt: contract.created_at,
        updatedAt: contract.updated_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getContractDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!UUID_PATTERN.test(id)) {
      return res.status(404).json({
        success: false,
        message: "Contract document not found",
      });
    }

    const params = [id, req.companyId];
    let reviewerFilter = "";

    if (req.userRole !== "ADMIN") {
      params.push(req.userId);
      reviewerFilter = "AND c.assigned_reviewer_id = $3";
    }

    const result = await pool.query(
      `
        SELECT
          document.file_key,
          document.file_name
        FROM contracts c
        JOIN LATERAL (
          SELECT cd.file_key, cd.file_name
          FROM contract_documents cd
          WHERE cd.contract_id = c.id
          ORDER BY cd.created_at DESC
          LIMIT 1
        ) document ON true
        WHERE c.id = $1
          AND c.company_id = $2
          ${reviewerFilter}
        LIMIT 1
      `,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Contract document not found",
      });
    }

    const { file_key: fileKey, file_name: fileName } = result.rows[0];
    if (typeof fileKey !== "string" || !fileKey.trim()) {
      return res.status(404).json({
        success: false,
        message: "Contract document not found",
      });
    }

    const { data, error } = await supabase.storage
      .from("contractai-documents")
      .download(fileKey);

    if (error) {
      if (String(error.statusCode) === "404") {
        return res.status(404).json({
          success: false,
          message: "Contract PDF file not found",
        });
      }

      const storageError = new Error("Unable to retrieve the contract PDF.");
      storageError.statusCode = 503;
      throw storageError;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Contract PDF file not found",
      });
    }

    const pdfBuffer = Buffer.from(await data.arrayBuffer());
    const safeFileName = getSafeFileName(path.basename(fileName || "contract.pdf")) || "contract.pdf";

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Content-Length": pdfBuffer.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });

    return res.end(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

export const uploadContract = async (req, res, next) => {
  let storagePath = null;
  let storageUploaded = false;
  let client = null;
  let transactionCommitted = false;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Contract PDF is required",
      });
    }

    const { contractName, vendorName, description } = req.body;

    if (
      !contractName ||
      typeof contractName !== "string" ||
      !contractName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Contract name is required",
      });
    }

    if (
      !vendorName ||
      typeof vendorName !== "string" ||
      !vendorName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Vendor name is required",
      });
    }

    if (contractName.trim().length > 255) {
      return res.status(400).json({
        success: false,
        message: "Contract name cannot exceed 255 characters",
      });
    }

    if (vendorName.trim().length > 255) {
      return res.status(400).json({
        success: false,
        message: "Vendor name cannot exceed 255 characters",
      });
    }

    if (description && description.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "Description cannot exceed 5000 characters",
      });
    }

    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: "PDF file cannot exceed 10 MB",
      });
    }

    const pdfHeader = req.file.buffer.subarray(0, 5).toString();

    if (pdfHeader !== "%PDF-") {
      return res.status(400).json({
        success: false,
        message: "Invalid PDF file",
      });
    }

    const fileId = randomUUID();
    const safeOriginalName = getSafeFileName(req.file.originalname);
    const storedFileName = `${fileId}-${safeOriginalName}`;
    storagePath = `uploads/contracts/${storedFileName}`;
    await uploadPdf(req.file.buffer, storagePath);
    storageUploaded = true;

    client = await pool.connect();

    await client.query("BEGIN");

    const contractResult = await client.query(
      `
        INSERT INTO contracts (
          company_id,
          uploaded_by,
          contract_name,
          vendor_name,
          description,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'UPLOADED'::contract_status)
        RETURNING
          id,
          company_id,
          uploaded_by,
          contract_name,
          vendor_name,
          description,
          status,
          risk_score,
          risk_level,
          assigned_reviewer_id,
          created_at,
          updated_at
      `,
      [
        req.companyId,
        req.userId,
        contractName.trim(),
        vendorName.trim(),
        description?.trim() || null,
      ],
    );

    const contract = contractResult.rows[0];

    const documentResult = await client.query(
      `
        INSERT INTO contract_documents (
          contract_id,
          file_name,
          file_key,
          file_url,
          mime_type,
          file_size
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          contract_id,
          file_name,
          file_key,
          file_url,
          mime_type,
          file_size,
          page_count,
          created_at
      `,
      [
        contract.id,
        req.file.originalname,
        storagePath,
        null,
        req.file.mimetype,
        req.file.size,
      ],
    );

    const document = documentResult.rows[0];

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
        contract.id,
        "CONTRACT_UPLOADED",
        `Contract "${contract.contract_name}" was uploaded`,
        JSON.stringify({
          contractId: contract.id,
          contractName: contract.contract_name,
          vendorName: contract.vendor_name,
          fileName: document.file_name,
          fileSize: document.file_size,
          mimeType: document.mime_type,
        }),
      ],
    );

    await client.query("COMMIT");
    transactionCommitted = true;

    try {
      await aiIngestionService.ingestContractDocument(req.file.buffer, {
        documentId: document.id,
      });
    } catch {
      // PostgreSQL and Qdrant cannot share a transaction. Keep the committed
      // upload in UPLOADED state and report indexing failure without leaking
      // provider details or deleting the source PDF/database records.
      console.error("Contract document ingestion failed after upload.");
      return res.status(503).json({
        success: false,
        message:
          "The contract was uploaded, but document indexing failed. Please contact support before retrying.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Contract uploaded successfully",
      contract: {
        id: contract.id,
        contractName: contract.contract_name,
        vendorName: contract.vendor_name,
        description: contract.description,
        status: contract.status,
        riskScore: contract.risk_score,
        riskLevel: contract.risk_level,
        uploadedBy: contract.uploaded_by,
        assignedReviewerId: contract.assigned_reviewer_id,
        createdAt: contract.created_at,
        updatedAt: contract.updated_at,
      },
      document: {
        id: document.id,
        contractId: document.contract_id,
        fileName: document.file_name,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        pageCount: document.page_count,
        createdAt: document.created_at,
      },
    });
  } catch (error) {
    if (client && !transactionCommitted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Contract upload rollback failed:", rollbackError);
      }
    }

    if (storageUploaded && !transactionCommitted) {
      try {
        await deletePdf(storagePath);
      } catch {
        console.error("Uploaded contract cleanup failed in Supabase Storage.");
      }
    }

    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
};

export const assignContract = async (req, res, next) => {
  const { id } = req.params;
  const { reviewerId } = req.body;

  if (!UUID_PATTERN.test(id)) {
    return res.status(404).json({
      success: false,
      message: "Contract not found",
    });
  }

  if (!reviewerId || !UUID_PATTERN.test(reviewerId)) {
    return res.status(400).json({
      success: false,
      message: "Valid reviewer ID is required",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const contractResult = await client.query(
      `
        SELECT
          id,
          company_id,
          contract_name,
          vendor_name,
          status,
          assigned_reviewer_id
        FROM contracts
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
      `,
      [id, req.companyId],
    );

    if (contractResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    const reviewerResult = await client.query(
      `
        SELECT
          id,
          company_id,
          email,
          full_name,
          role,
          is_active
        FROM users
        WHERE id = $1
          AND company_id = $2
          AND role = 'REVIEWER'
        LIMIT 1
      `,
      [reviewerId, req.companyId],
    );

    if (reviewerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Reviewer not found",
      });
    }

    const reviewer = reviewerResult.rows[0];

    if (!reviewer.is_active) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Cannot assign a contract to an inactive reviewer",
      });
    }

    const contract = contractResult.rows[0];

    const reviewResult = await client.query(
      `
        SELECT
          id,
          status
        FROM reviews
        WHERE contract_id = $1
        LIMIT 1
      `,
      [id],
    );

    let review;

    if (reviewResult.rows.length === 0) {
      const newReviewResult = await client.query(
        `
          INSERT INTO reviews (
            contract_id,
            reviewer_id,
            status
          )
          VALUES ($1, $2, 'PENDING')
          RETURNING
            id,
            contract_id,
            reviewer_id,
            status,
            created_at,
            updated_at
        `,
        [id, reviewerId],
      );

      review = newReviewResult.rows[0];
    } else {
      const existingReview = reviewResult.rows[0];

      const updateReviewResult = await client.query(
        `
          UPDATE reviews
          SET
            reviewer_id = $1,
            status = CASE
              WHEN status = 'COMPLETED'
                THEN 'PENDING'::review_status
              WHEN status = 'CHANGES_REQUESTED'
                THEN 'PENDING'::review_status
              ELSE status
            END,
            updated_at = NOW(),
            completed_at = CASE
              WHEN status IN ('COMPLETED', 'CHANGES_REQUESTED')
                THEN NULL
              ELSE completed_at
            END
          WHERE id = $2
          RETURNING
            id,
            contract_id,
            reviewer_id,
            status,
            created_at,
            updated_at
        `,
        [reviewerId, existingReview.id],
      );

      review = updateReviewResult.rows[0];
    }

    const updatedContractResult = await client.query(
      `
        UPDATE contracts
        SET
          assigned_reviewer_id = $1,
          status = CASE
            WHEN status = 'COMPLETED'
              THEN 'UNDER_REVIEW'::contract_status
            WHEN status = 'CHANGES_REQUESTED'
              THEN 'UNDER_REVIEW'::contract_status
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
        RETURNING
          id,
          contract_name,
          vendor_name,
          description,
          status,
          risk_score,
          risk_level,
          uploaded_by,
          assigned_reviewer_id,
          created_at,
          updated_at
      `,
      [reviewerId, id, req.companyId],
    );

    if (updatedContractResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    const updatedContract = updatedContractResult.rows[0];

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
        updatedContract.id,
        "CONTRACT_ASSIGNED",
        `Contract "${updatedContract.contract_name}" was assigned to reviewer ${reviewer.email}`,
        JSON.stringify({
          contractId: updatedContract.id,
          contractName: updatedContract.contract_name,
          vendorName: updatedContract.vendor_name,
          reviewerId: reviewer.id,
          reviewerEmail: reviewer.email,
          reviewerName: reviewer.full_name,
          previousReviewerId: contract.assigned_reviewer_id,
        }),
      ],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Contract assigned successfully",
      contract: {
        id: updatedContract.id,
        contractName: updatedContract.contract_name,
        vendorName: updatedContract.vendor_name,
        description: updatedContract.description,
        status: updatedContract.status,
        riskScore: updatedContract.risk_score,
        riskLevel: updatedContract.risk_level,
        uploadedBy: updatedContract.uploaded_by,
        assignedReviewerId: updatedContract.assigned_reviewer_id,
        createdAt: updatedContract.created_at,
        updatedAt: updatedContract.updated_at,
      },
      reviewer: {
        id: reviewer.id,
        email: reviewer.email,
        fullName: reviewer.full_name,
        role: reviewer.role,
        isActive: reviewer.is_active,
      },
      review: {
        id: review.id,
        contractId: review.contract_id,
        reviewerId: review.reviewer_id,
        status: review.status,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
