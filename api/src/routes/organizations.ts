// ─── Organization Routes ───────────────────────────────────────────────────
// Tenant listing, creation, and switching endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  CreateOrganizationSchema,
  SwitchOrganizationSchema,
  InviteMemberSchema,
  UpdateMemberRoleSchema,
} from "@voiceflow/shared";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { validateBody } from "../middleware/validate.js";
import {
  listOrganizations,
  createOrganization,
  switchOrganization,
} from "../controllers/orgController.js";
import {
  listTeamMembers,
  inviteTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
} from "../controllers/teamController.js";

const router = Router();

router.use(authenticate);

router.get("/", listOrganizations);
router.post("/", validateBody(CreateOrganizationSchema), createOrganization);
router.post("/switch", validateBody(SwitchOrganizationSchema), switchOrganization);

// Team & RBAC Member Management (scoped to active tenant)
router.get("/members", resolveTenant, listTeamMembers);
router.post("/members", resolveTenant, validateBody(InviteMemberSchema), inviteTeamMember);
router.patch("/members/:id", resolveTenant, validateBody(UpdateMemberRoleSchema), updateTeamMemberRole);
router.delete("/members/:id", resolveTenant, removeTeamMember);

export default router;

