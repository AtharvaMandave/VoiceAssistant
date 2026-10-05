import { Router } from "express";
import {
  handleVoiceTurn,
  handleSynthesize,
  handleListVoices,
} from "../controllers/voiceController.js";
import { authenticate } from "../middleware/auth.js";
import { resolveTenant } from "../middleware/tenant.js";

export const voiceRouter = Router();

// Voice turn endpoint (authenticated dashboard turn)
voiceRouter.post(
  "/agents/:agentId/conversations/:id/voice-turn",
  authenticate,
  resolveTenant,
  handleVoiceTurn
);

// Voice preview & management endpoints
voiceRouter.post("/voice/synthesize", authenticate, resolveTenant, handleSynthesize);
voiceRouter.get("/voice/voices", authenticate, resolveTenant, handleListVoices);
