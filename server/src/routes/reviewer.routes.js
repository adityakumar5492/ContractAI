import { Router } from "express";

import {
  getReviewers,
  createReviewer,
  updateReviewer,
} from "../controllers/reviewer.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  getReviewers,
);

router.post(
  "/",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  createReviewer,
);

router.patch(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  updateReviewer,
);

export default router;