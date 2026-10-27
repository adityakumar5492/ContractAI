import { Router } from "express";

import {
  getContracts,
  getContractById,
  assignContract,
  uploadContract,
  getContractDocument,
} from "../controllers/contracts.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";
import upload from "../middleware/upload.js";
import { analyzeAndPersistContractRisks } from "../controllers/riskAnalysis.controller.js";
import { getContractReview, updateFindingStatus, addFindingComment } from "../controllers/reviews.controller.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getContracts,
);

router.post(
  "/upload",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  upload.single("file"),
  uploadContract,
);

router.get(
  "/:id/document",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getContractDocument,
);

router.get(
  "/:id/review",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getContractReview,
);

router.patch(
  "/:id/findings/:findingId",
  requireAuth,
  companyScope,
  requireRole("REVIEWER"),
  updateFindingStatus,
);

router.post(
  "/:id/findings/:findingId/comments",
  requireAuth,
  companyScope,
  requireRole("REVIEWER"),
  addFindingComment,
);

router.get(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getContractById,
);

router.patch(
  "/:id/assign",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  assignContract,
);

router.post(
  "/:id/analyze-risks",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  analyzeAndPersistContractRisks,
);

export default router;
