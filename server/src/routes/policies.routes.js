import { Router } from "express";

import {
  deletePolicy,
  getPolicies,
  getPolicyById,
  updatePolicyStatus,
  uploadPolicy,
} from "../controllers/policies.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";
import upload from "../middleware/upload.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getPolicies,
);

router.post(
  "/upload",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  upload.single("file"),
  uploadPolicy,
);

router.get(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getPolicyById,
);

router.patch(
  "/:id/status",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  updatePolicyStatus,
);

router.delete(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  deletePolicy,
);

export default router;
