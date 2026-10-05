// ─── Webhook Routes ───────────────────────────────────────────────────────────
// Endpoints for registering, managing, and testing webhook subscriptions.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { CreateWebhookSchema } from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { validateBody } from "../middleware/validate.js";
import {
  listWebhooks,
  createWebhook,
  testWebhook,
  deleteWebhook,
} from "../controllers/webhookController.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", listWebhooks);
router.post("/", validateBody(CreateWebhookSchema), createWebhook);
router.post("/:id/test", testWebhook);
router.delete("/:id", deleteWebhook);

export default router;
