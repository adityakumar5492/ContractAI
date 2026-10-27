import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

import { clerkAuth } from "./config/clerk.js";

import authRoutes from "./routes/auth.routes.js";
import onboardingRoutes from "./routes/onboarding.routes.js";
import companyRoutes from "./routes/company.routes.js";
import usersRoutes from "./routes/users.routes.js";
import contractsRoutes from "./routes/contracts.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import reviewerRoutes from "./routes/reviewer.routes.js";
import reviewerInvitationRoutes from "./routes/reviewerInvitation.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import reviewRoutes from "./routes/reviews.routes.js";
import policiesRoutes from "./routes/policies.routes.js";
import reportsRoutes from "./routes/reports.routes.js";

import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkAuth);

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ContractAI API is running",
  });
});

app.use("/api/auth", authRoutes);

app.use("/api/onboarding", onboardingRoutes);

app.use("/api/company", companyRoutes);

app.use("/api/users", usersRoutes);

app.use("/api/contracts", contractsRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/reviewers", reviewerRoutes);

app.use("/api/reviewer-invitations", reviewerInvitationRoutes);

app.use("/api/audit-logs", auditRoutes);

app.use("/api/reviews", reviewRoutes);

app.use("/api/policies", policiesRoutes);

app.use("/api/reports", reportsRoutes);

app.use(errorHandler);

export default app;
