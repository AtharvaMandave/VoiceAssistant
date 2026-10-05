// ─── API Key Routes ───────────────────────────────────────────────────────────
// Endpoints for listing, generating, and revoking API keys.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { CreateApiKeySchema } from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { validateBody } from "../middleware/validate.js";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "../controllers/apiKeyController.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/", listApiKeys);
router.post("/", validateBody(CreateApiKeySchema), createApiKey);
router.delete("/:id", revokeApiKey);

export default router;
