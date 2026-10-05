// ─── Widget Routes ──────────────────────────────────────────────────────────
// Public routes for the embeddable voice widget.
// These routes do NOT require authentication — origin validation is used instead.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  handleGetWidgetConfig,
  handleCreateWidgetSession,
  handleWidgetTurn,
} from "../controllers/widgetController.js";

const widgetRouter = Router();

// GET  /api/widget/config/:agentId — Public widget configuration
widgetRouter.get("/config/:agentId", handleGetWidgetConfig);

// POST /api/widget/session — Create ephemeral widget session
widgetRouter.post("/session", handleCreateWidgetSession);

// POST /api/widget/turn — Process public turn (voice or text)
widgetRouter.post("/turn", handleWidgetTurn);

export default widgetRouter;
