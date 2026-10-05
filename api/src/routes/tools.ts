// ─── Tool Routes ────────────────────────────────────────────────────────────
// RESTful endpoints for managing agent tools (Phase 7).
// Mounted under /api/agents/:agentId/tools
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { CreateToolSchema, UpdateToolSchema, ToolQuerySchema } from "@voiceflow/shared";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { requireRole } from "../middleware/tenant.js";
import {
  listTools,
  getTool,
  createTool,
  updateTool,
  deleteTool,
  seedBuiltInTools,
  toggleTool,
} from "../controllers/toolController.js";

// Use mergeParams so we can access :agentId from the parent router
const router = Router({ mergeParams: true });

// List tools for this agent
router.get("/", validateQuery(ToolQuerySchema), listTools);

// Seed built-in tools (idempotent)
router.post(
  "/seed",
  requireRole(["owner", "admin", "developer"]),
  seedBuiltInTools
);

// Create a new tool
router.post(
  "/",
  requireRole(["owner", "admin", "developer"]),
  validateBody(CreateToolSchema),
  createTool
);

// Get a specific tool
router.get("/:toolId", getTool);

// Update a tool
router.patch(
  "/:toolId",
  requireRole(["owner", "admin", "developer"]),
  validateBody(UpdateToolSchema),
  updateTool
);

// Toggle tool enabled/disabled
router.post(
  "/:toolId/toggle",
  requireRole(["owner", "admin", "developer"]),
  toggleTool
);

// Delete a tool
router.delete(
  "/:toolId",
  requireRole(["owner", "admin"]),
  deleteTool
);

export const toolsRouter = router;
