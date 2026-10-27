import { Router } from "express";

import { getReportsSummary } from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  companyScope,
  requireRole("ADMIN", "REVIEWER"),
  getReportsSummary,
);

export default router;
