import { Router } from "express";
import {
  getCompany,
  updateCompany,
} from "../controllers/company.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  getCompany,
);

router.patch(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  updateCompany,
);

export default router;