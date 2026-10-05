// ─── Billing Routes ───────────────────────────────────────────────────────────
// Endpoints for quotas, resource usage aggregation, and plan upgrades.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { UpdatePlanSchema } from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { validateBody } from "../middleware/validate.js";
import {
  getUsageAndBilling,
  updatePlan,
} from "../controllers/billingController.js";

const router = Router();

router.use(authenticate, resolveTenant);

router.get("/usage", getUsageAndBilling);
router.post("/plan", validateBody(UpdatePlanSchema), updatePlan);

export default router;
