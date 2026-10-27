import dotenv from "dotenv";
import { clerkMiddleware, getAuth } from "@clerk/express";

dotenv.config();

export const clerkAuth = clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
});

export const getUserAuth = (req) => {
  return getAuth(req);
};