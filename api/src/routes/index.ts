// ─── Root Router ────────────────────────────────────────────────────────────
// Mounts all module-specific route groups under /api.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import orgRouter from "./organizations.js";
import agentsRouter from "./agents.js";
import conversationsRouter from "./conversations.js";
import { voiceRouter } from "./voice.js";
import widgetRouter from "./widget.js";
import apiKeysRouter from "./apiKeys.js";
import webhooksRouter from "./webhooks.js";
import billingRouter from "./billing.js";

const router = Router();

// Infrastructure
router.use("/health", healthRouter);

// Core SaaS Modules (Phase 1, 2, 3, 4)
router.use("/auth", authRouter);
router.use("/organizations", orgRouter);
router.use("/agents", agentsRouter);
router.use("/conversations", conversationsRouter);
router.use(voiceRouter);

// Embeddable Widget — Public, no auth (Phase 6)
router.use("/widget", widgetRouter);

// Phase 9 SaaS Extensions
router.use("/api-keys", apiKeysRouter);
router.use("/webhooks", webhooksRouter);
router.use("/billing", billingRouter);

// Tool routes are mounted under /api/agents/:agentId/tools (Phase 7)

export default router;
