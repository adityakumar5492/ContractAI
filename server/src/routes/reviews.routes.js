import { Router } from "express";

import { updateReview } from "../controllers/reviews.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.patch(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("REVIEWER"),
  updateReview,
);

export default router;
