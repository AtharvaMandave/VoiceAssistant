// ─── Agent Routes ──────────────────────────────────────────────────────────
// RESTful endpoints for voice agent lifecycle and configuration.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  AgentQuerySchema,
  CreateConversationSchema,
  ConversationQuerySchema,
} from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant, requireRole } from "../middleware/tenant.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
} from "../controllers/agentController.js";
import {
  createConversation,
  listAgentConversations,
  getPromptPreview,
} from "../controllers/conversationController.js";
import { documentsRouter, knowledgeRouter } from "./knowledge.js";
import { toolsRouter } from "./tools.js";

const router = Router();

// All agent operations require an authenticated user and resolved active tenant
router.use(authenticate, resolveTenant);

router.get("/", validateQuery(AgentQuerySchema), listAgents);
router.post(
  "/",
  requireRole(["owner", "admin", "developer"]),
  validateBody(CreateAgentSchema),
  createAgent
);
router.get("/:id", getAgent);
router.patch(
  "/:id",
  requireRole(["owner", "admin", "developer"]),
  validateBody(UpdateAgentSchema),
  updateAgent
);
router.put(
  "/:id",
  requireRole(["owner", "admin", "developer"]),
  validateBody(UpdateAgentSchema),
  updateAgent
);
router.delete(
  "/:id",
  requireRole(["owner", "admin"]),
  deleteAgent
);

// Agent Conversations & Testing (Phase 2)
router.post(
  "/:agentId/conversations",
  validateBody(CreateConversationSchema),
  createConversation
);
router.get(
  "/:agentId/conversations",
  validateQuery(ConversationQuerySchema),
  listAgentConversations
);
router.get("/:agentId/prompt-preview", getPromptPreview);

// Agent Knowledge & Documents (Phase 3)
router.use("/:agentId/documents", documentsRouter);
router.use("/:agentId/knowledge", knowledgeRouter);

// Agent Tools (Phase 7)
router.use("/:agentId/tools", toolsRouter);

export default router;
