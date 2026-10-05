// ─── Conversation Routes ────────────────────────────────────────────────────
// Multi-turn message exchange and session status endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { SendMessageSchema } from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { validateBody } from "../middleware/validate.js";
import {
  getConversation,
  sendMessage,
  endConversation,
  listAllConversations,
  getConversationStats,
  evaluateConversation,
  toggleEscalation,
} from "../controllers/conversationController.js";

const router = Router();

// Protect all conversation routes with user auth & active tenant resolution
router.use(authenticate, resolveTenant);

// Collection-level routes
router.get("/", listAllConversations);
router.get("/stats", getConversationStats);

// Item-level routes
router.get("/:id", getConversation);
router.post("/:id/messages", validateBody(SendMessageSchema), sendMessage);
router.post("/:id/end", endConversation);
router.post("/:id/evaluate", evaluateConversation);
router.post("/:id/escalate", toggleEscalation);

export default router;
