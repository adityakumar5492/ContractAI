import { Router } from "express";

import { getAuditLogs } from "../controllers/audit.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  getAuditLogs,
);

export default router;