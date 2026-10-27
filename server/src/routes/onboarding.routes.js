import { Router } from "express";
import { createCompany } from "../controllers/onboarding.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/company", requireAuth, createCompany);

export default router;