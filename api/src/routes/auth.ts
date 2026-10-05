// ─── Auth Routes ───────────────────────────────────────────────────────────
// Session bootstrap and user profile endpoints.
// Rate-limited to prevent brute force and credential stuffing attacks.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { getSession, getMe } from "../controllers/authController.js";
import { authRateLimiter } from "../middleware/security.js";

const router = Router();

// Auth endpoints — rate limited (10 attempts per 15 minutes)
router.post("/session", authRateLimiter, authenticate, resolveTenant, getSession);
router.get("/me", authenticate, resolveTenant, getMe);

export default router;
