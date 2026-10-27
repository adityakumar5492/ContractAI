import { Router } from "express";

import {
  acceptReviewerInvitation,
  createReviewerInvitation,
  getReviewerInvitations,
  resendReviewerInvitation,
  revokeReviewerInvitation,
} from "../controllers/reviewerInvitation.controller.js";

import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Invitees are authenticated by Clerk but have no users row yet, so acceptance
// must run before companyScope. The invitation token supplies tenant context.
router.post("/accept", requireAuth, acceptReviewerInvitation);

router.use(requireAuth, companyScope, requireRole("ADMIN"));

router.post("/", createReviewerInvitation);
router.get("/", getReviewerInvitations);
router.post("/:id/resend", resendReviewerInvitation);
router.delete("/:id", revokeReviewerInvitation);

export default router;
