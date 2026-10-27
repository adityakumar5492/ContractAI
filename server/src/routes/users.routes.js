import { Router } from "express";
import { getUserById } from "../controllers/users.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { companyScope } from "../middleware/companyScope.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

router.get(
  "/:id",
  requireAuth,
  companyScope,
  requireRole("ADMIN"),
  getUserById,
);

export default router;