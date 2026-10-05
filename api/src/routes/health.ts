// ─── Health Check Route ─────────────────────────────────────────────────────
// Returns the status of database and Redis connections.
// Used by Docker health checks and monitoring systems.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { isDatabaseConnected } from "../config/db.js";
import { isRedisConnected } from "../config/redis.js";
import { sendSuccess } from "../utils/response.js";

const router = Router();

router.get("/", async (_req, res) => {
  const dbConnected = isDatabaseConnected();
  const redisConnected = await isRedisConnected();

  const status = dbConnected && redisConnected ? "healthy" : "degraded";

  sendSuccess(res, {
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: dbConnected ? "connected" : "disconnected",
      redis: redisConnected ? "connected" : "disconnected",
    },
  });
});

export default router;
